import { MarkdownPostProcessorContext, ButtonComponent, MarkdownSectionInformation, setIcon } from "obsidian";
import { exec, execSync } from "child_process";
import { delimiter } from "path";
import debounce from "lodash.debounce";
import os from "os";

import D2Plugin from "../main";
import { Utility } from "./utils";
import { addEventListeners } from "./eventListeners";

export class D2Processor {
  plugin: D2Plugin;
  debouncedMap: Map<
    string,
    (
      source: string,
      el: HTMLElement,
      ctx: MarkdownPostProcessorContext,
      signal?: AbortSignal
    ) => Promise<void>
  >;
  abortControllerMap: Map<string, AbortController>;
  prevImage: string;
  abortController: AbortController;

  constructor(plugin: D2Plugin) {
    this.plugin = plugin;
    this.debouncedMap = new Map();
    this.abortControllerMap = new Map();
  }

  attemptExport = async (
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
    signal?: AbortSignal
  ) => {
    const utility = new Utility(this.plugin);

    const codeblockInfo = ctx.getSectionInfo(el);
    const d2CodeBlock = codeblockInfo?.text.split('\n').slice(codeblockInfo.lineStart,(codeblockInfo.lineEnd + 1)).join('\n');
    const d2Param =  codeblockInfo?.text.split('\n')[ codeblockInfo.lineStart].split(' ').slice(1).join(' ');
    const d2ParamJson = utility.parseD2Param(d2Param);
  
    if(!source){ utility.errorConsole(el,`\nInput content is empty.`); }

    const addWrapOpt = {
      addClass: ["d2-wrap","accordion","active"], 
      addChild:`<div class="accordion-header">
      <div class="accordion-arrow"></div>
      <div class="accordion-label">d2</div></div>`
    }
    const wrap = utility.addWrap(el, addWrapOpt);
    const arrow: HTMLElement | null | undefined = wrap?.querySelector('.accordion-arrow');
    if(arrow){ setIcon(arrow,'chevron-up'); }
    el.classList.add('d2-content','accordion-content');

    setTimeout(async() => {
      await this.export(source, el, ctx);
      await utility.scaleElementToFitParent(el);
      await utility.accordion(1);
    }, 100)

    let d2Title = d2ParamJson?.title || '';

    const accordionLabel = el.closest('.accordion')?.querySelector('.accordion-label');
    if (d2Title && accordionLabel) {
      accordionLabel.textContent = d2Title;
    }

    addEventListeners(this.plugin, source, el, ctx, d2CodeBlock as string, d2Title, codeblockInfo as MarkdownSectionInformation, signal);
    
  };

  isValidUrl = (urlString: string) => {
    let url;
    try {
      url = new URL(urlString);
    } catch (e) {
      return false;
    }
    return url.protocol === "http:" || url.protocol === "https:";
  };

  formatLinks = (svgEl: HTMLElement) => {
    // Add attributes to <a> tags to make them Obsidian compatible :
    const links = svgEl.querySelectorAll("a");
    links.forEach((link: HTMLElement) => {
      const href = link.getAttribute("href") ?? "";
      // Check for internal link
      if (!this.isValidUrl(href)) {
        link.classList.add("internal-link");
        link.setAttribute("data-href", href);
        link.setAttribute("target", "_blank");
        link.setAttribute("rel", "noopener");
      }
    });
  };

  sanitizeSVGIDs = (svgEl: HTMLElement, docID: string): string => {
    // append docId to <marker> || <mask> || <filter> id's so that they're unique across different panels & edit/view mode
    const overrides = svgEl.querySelectorAll("marker, mask, filter");
    const overrideIDs: string[] = [];
    overrides.forEach((override) => {
      const id = override.getAttribute("id");
      if (id) {
        overrideIDs.push(id);
      }
    });
    return overrideIDs.reduce((svgHTML, overrideID) => {
      return svgHTML.replaceAll(overrideID, [overrideID, docID].join("-"));
    }, svgEl.outerHTML);
  };

  insertImage(image: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
    const parser = new DOMParser();
    const svg = parser.parseFromString(image, "image/svg+xml");

    const svgEl = svg.documentElement;

    this.formatLinks(svgEl);
    el.innerHTML = this.sanitizeSVGIDs(svgEl, ctx.docId);
  }

  async getDiagramData(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
    signal?: AbortSignal
  ) {
    const svgString = await this.generatePreview(source, signal);
    const parser = new DOMParser();
    const svgNode = parser.parseFromString(svgString, "image/svg+xml");

    const svgEl = svgNode.documentElement;

    this.formatLinks(svgEl);
    return svgEl;
  }

  export = async (
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
    signal?: AbortSignal
  ) => {
    try {
      const image = await this.generatePreview(source, signal);
      if (image) {
        el.empty();
        this.prevImage = image;
        this.insertImage(image, el, ctx);
      }
    } catch (err) {
      const utility = new Utility(this.plugin);
      el.empty();
      utility.errorConsole(el,`\n${err.message}`);
      if (this.prevImage) {
        this.insertImage(this.prevImage, el, ctx);
      }
    } finally {
      const pageContainer = (ctx as any).containerEl;
      this.abortControllerMap.delete(pageContainer.dataset.id);
    }
  };

  async generatePreview(source: string, signal?: AbortSignal): Promise<string> {
    const pathArray = [process.env.PATH, "/opt/homebrew/bin", "/usr/local/bin"];

    // platform will be win32 even on 64 bit windows
    if (os.platform() === "win32") {
      pathArray.push(`C:\Program Files\D2`);
    } else {
      pathArray.push(`${process.env.HOME}/.local/bin`);
    }

    let GOPATH = "";
    try {
      GOPATH = execSync("go env GOPATH", {
        env: {
          ...process.env,
          PATH: pathArray.join(delimiter),
        },
      }).toString();
    } catch (error) {
      // ignore if go is not installed
    }

    if (GOPATH) {
      pathArray.push(`${GOPATH.replace("\n", "")}/bin`);
    }
    if (this.plugin.settings.d2Path) {
      pathArray.push(this.plugin.settings.d2Path);
    }

    const options: any = {
      ...process.env,
      env: {
        PATH: pathArray.join(delimiter),
      },
      signal,
    };
    if (this.plugin.settings.apiToken) {
      options.env.TSTRUCT_TOKEN = this.plugin.settings.apiToken;
    }

    let args = [
      `d2`,
      "-",
      `--theme=${this.plugin.settings.theme}`,
      `--layout=${this.plugin.settings.layoutEngine}`,
      `--pad=${this.plugin.settings.pad}`,
      `--sketch=${this.plugin.settings.sketch}`,
      "--bundle=false",
      "--scale=1",
    ];
    const cmd = args.join(" ");
    const child = exec(cmd, options);
    child.stdin?.write(source);
    child.stdin?.end();

    let stdout: any;
    let stderr: any;

    if (child.stdout) {
      child.stdout.on("data", (data) => {
        if (stdout === undefined) {
          stdout = data;
        } else {
          stdout += data;
        }
      });
    }

    if (child.stderr) {
      child.stderr.on("data", (data) => {
        if (stderr === undefined) {
          stderr = data;
        } else {
          stderr += data;
        }
      });
    }

    return new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (code: number) => {
        if (code === 0) {
          resolve(stdout);
          return;
        } else if (stderr) {
          console.error(stderr);
          reject(new Error(stderr));
        } else if (stdout) {
          console.error(stdout);
          reject(new Error(stdout));
        }
      });
    });
  }
}
