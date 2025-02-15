import { MarkdownPostProcessorContext, MarkdownSectionInformation, MarkdownView, Notice, TFile, addIcon, setIcon } from 'obsidian';
import D2Plugin from "../main";
import { D2Processor } from "./processor";
import { jsonrepair } from 'jsonrepair';
import { t } from "lang/helpers"

export class Utility {
  plugin: D2Plugin;

  constructor(plugin: D2Plugin) {
    this.plugin = plugin;
  }

  errorConsole(el: HTMLElement, message: string): void {
    const errorDiv = document.createElement('div');
    errorDiv.classList.add('d2-console-error');
    const errorTitle = `
      <div class="d2-console-error-title">
        <div class="d2-console-error-title-svg"></div>
        &nbsp;&nbsp;<div class="console-error-triangle">▶</div>&nbsp;Error
      </div>`;
    const formattedMessage = `${errorTitle}${message.replace(/\n/g, '<br>')}`;
    this.replaceContent(formattedMessage, errorDiv);
    el.appendChild(errorDiv);
    const errorTitleEl: HTMLElement | null = errorDiv.querySelector('.d2-console-error-title-svg');
    if (errorTitleEl) {
      const errorIconSVG = `<path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm4.207 12.793-1.414 1.414L12 13.414l-2.793 2.793-1.414-1.414L10.586 12 7.793 9.207l1.414-1.414L12 10.586l2.793-2.793 1.414 1.414L13.414 12l2.793 2.793z"></path>`;
      this.addd2Icon(errorTitleEl,'d2-console-error-svg',errorIconSVG);
    }
  }

  addd2Icon(parentEl: HTMLElement, iconID: string, svgContent: string, viewBox: string = `0 0 24 24`){
    if(!parentEl){ return; }
    const globalAny = globalThis as any;
    if (!globalAny.addedIcons) {
      globalAny.addedIcons = new Set<string>();
    }
    const addedIcons = globalAny.addedIcons;
    if (!addedIcons.has(iconID)) {
      addIcon(iconID, svgContent);
      addedIcons.add(iconID);
    }
    setIcon(parentEl,iconID);
    const svg = parentEl.querySelector('svg');
    if(svg){ svg.setAttribute("viewBox", viewBox); }
  }

  replaceContent(htmlString: string, parentElement: HTMLElement) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    while (parentElement.firstChild) {
      parentElement.removeChild(parentElement.firstChild);
    }
    Array.from(doc.body.childNodes).forEach(node => {
      parentElement.appendChild(node);
    });
  }

  getSvgXml(svg: HTMLElement) {
    const serializer = new XMLSerializer();
    let svgString;
    if (svg && svg instanceof Node) {
      svgString = new XMLSerializer().serializeToString(svg);
    } else {
      svgString = svg;
    }
    return svgString;
  }

  svgStringToCanvas(svgString: BlobPart) {
    return new Promise((resolve, reject) => {
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      const img = new Image();
      img.onload = function () {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;

        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);

        URL.revokeObjectURL(url);

        resolve(canvas);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load SVG image'));
      };
      img.src = url;
    });
  }

  async getDiagramData(type: string, source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext, signal?: AbortSignal) {
    let result: any = null;
    const processor = new D2Processor(this.plugin);
    const tempSvgDiv = document.createElement('div');
    result = await processor.getDiagramData(source, tempSvgDiv, ctx, signal);
    tempSvgDiv.remove();
    if(type === 'canvas'){
      const canvasString = this.getSvgXml(result);
      const canvas = this.svgStringToCanvas(canvasString);
      return canvas;
    } else {
      return result;
    }
  }

  async exportDiagram(ctx: MarkdownPostProcessorContext, d2CodeBlock: string | undefined, d2Title: string, isMarkdown: boolean, diagramData: ArrayBuffer | null, data: string | null, diagramType: string) {
    const documentPath = this.plugin.app.vault.getAbstractFileByPath(ctx.sourcePath)?.path;
    const documentPathLink = `---\n${t("SOURCE_PATH")}:\n    ${documentPath}\n---\n`;
    const d2MarkdownLinked = `${documentPathLink}${d2CodeBlock}\n`;
    const markdownTitle = d2Title ? d2Title : '';
    if (!isMarkdown) {
      if (diagramType === "png" || diagramType === "webp") {
        await this.saveFile(ctx, diagramType, null, diagramData, markdownTitle);
      } else {
        await this.saveFile(ctx, diagramType, data, null, markdownTitle);
      }
    } else {
      await this.saveFile(ctx, 'md', d2MarkdownLinked, null, markdownTitle);
    }
  }

  async exportDiagramLink(ctx: MarkdownPostProcessorContext, d2CodeBlock: string | RegExp, d2Title: string, codeblockInfo: MarkdownSectionInformation | null, isMarkdown: boolean, diagramData: ArrayBuffer | null, data: string | null, diagramType: string) {
    const documentPath = this.plugin.app.vault.getAbstractFileByPath(ctx.sourcePath)?.path;
    const documentPathLink = `---\n${t("SOURCE_PATH")}:\n    ${documentPath}\n---\n`;
    const d2MarkdownLinked = `${documentPathLink}${d2CodeBlock}\n`;
    const markdownTitle = d2Title ? d2Title : '';
    const attachmentPath = await this.saveFile(ctx, 'md', d2MarkdownLinked, null, markdownTitle);
    const attachmentName = attachmentPath?.split('/')[(attachmentPath?.split('/').length - 1)].split('.')[0];
    let attachmentLink = `![${attachmentName}](${attachmentPath} "${attachmentName}")\n`;
    if (!isMarkdown) {
      let diagramPath;
      if (diagramType === "png" || diagramType === "webp") {
        diagramPath = await this.saveFile(ctx, diagramType, null, diagramData, markdownTitle);
      } else if (diagramType === "base64") {
        diagramPath = data;
      } else {
        diagramPath = await this.saveFile(ctx, diagramType, data, null, markdownTitle);
      }
      const diagramLink = `![${attachmentName}](${diagramPath} "${attachmentName}")\n`;
      const backupLink = `${t("PINTORA_CODE_BACKUP_LINK")} [${attachmentName}](${attachmentPath} "${attachmentName}")`;
      attachmentLink = diagramLink + backupLink;
    }
    const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    const newContent = codeblockInfo?.text.replace(d2CodeBlock, attachmentLink);
    if (view && newContent) { view.editor.setValue(newContent); }
    this.plugin.refreshEditor();
  }

  scaleElementToFitParent(el: HTMLElement) {
    let parentWidth = el.offsetWidth;
    const diagramEl = el?.querySelector('canvas') || el?.querySelector('svg');
    if (diagramEl) {
      let aspectRatio;
      if (diagramEl instanceof HTMLCanvasElement) {
        aspectRatio = diagramEl.width / diagramEl.height;
      } else if (diagramEl instanceof SVGElement) {
        if (diagramEl.classList.contains("d2-console-error-svg")) { return false; }
        if (!diagramEl.hasAttribute('xmlns')) {
          diagramEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        }
        const bbox = diagramEl.getBBox();
        aspectRatio = bbox.width / bbox.height;
        diagramEl.setAttribute("viewBox", `0 0 ${bbox.width} ${bbox.height}`);
        diagramEl.setAttribute("preserveAspectRatio", "xMidYMid meet");
      }
      if(aspectRatio){
        diagramEl.style.width = `${parentWidth}px`;
        diagramEl.style.height = `${parentWidth / aspectRatio}px`;
      }
    }
  }

  addWrap(selector: string | HTMLElement | undefined, options = {}) {
    const element = typeof selector === 'string' ? document.querySelector(selector) : typeof selector === 'object' ? selector : undefined;
    if (!element) { return; }
    const wrap = document.createElement('div');
    const wrapOptions = {
      addClass: '',
      addChild: '',
      overlay: '',
      progress: '',
      removeElStyle: false,
      addPadding: '',
      ...options
    }
    if (wrapOptions.addClass) {
      wrap.classList.add(...wrapOptions.addClass);
    }
    if (wrapOptions.addChild) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(wrapOptions.addChild, 'text/html');
      const firstChild = doc.body.firstChild;
      if (firstChild) {
        wrap.appendChild(firstChild);
      }
    }
    if (wrapOptions.overlay) {
      const overlayEl = document.createElement('div');
      overlayEl.classList.add(wrapOptions.overlay);
      if (wrapOptions.progress) { this.replaceContent(wrapOptions.progress, overlayEl); }
      wrap.appendChild(overlayEl);
    }
    if (wrapOptions.removeElStyle) {
      element.removeAttribute('class');
      element.removeAttribute('style');
    }
    if (wrapOptions.addPadding) {
      wrap.style.padding = wrapOptions.addPadding;
    }
    element.parentNode?.insertBefore(wrap, element);
    wrap.appendChild(element);
    return wrap;
  }

  parseD2Param(param: string | undefined): Record<string, null> {
    if (!param) { return {}; }
    const repairedParam = jsonrepair(param);
    try {
      return JSON.parse(repairedParam);
    } catch {
      return {};
    }
  }

  accordion(time: number): void {
    const accordions = document.querySelectorAll<HTMLElement>('.accordion');

    accordions.forEach(accordion => {
      const header = accordion.querySelector<HTMLElement>('.accordion-header');
      const content = accordion.querySelector<HTMLElement>('.accordion-content');

      if (!header || !content) { return; }

      const diagramEl = content.firstElementChild as HTMLElement | null;
      const contentHeight = diagramEl ? `${diagramEl.scrollHeight}px` : '0px';
      let isCollapsed = !accordion.classList.contains('active');

      function toggleCollapse(): void {
        if (!content) { return; }
        isCollapsed = !isCollapsed;
        if (isCollapsed) {
          content.style.maxHeight = '0px';
          accordion.classList.remove('active');
        } else {
          content.style.maxHeight = contentHeight;
          accordion.classList.add('active');
        }
      }

      header.removeEventListener('click', toggleCollapse);
      header.addEventListener('click', toggleCollapse);

      if (accordion.classList.contains('active')) {
        isCollapsed = false;
        setTimeout(() => {
          content.style.maxHeight = contentHeight;
        }, time);
      }
    });
  }



  getFilename = (ctx: MarkdownPostProcessorContext) => {
    const now = Math.floor(Date.now() / 1000);
    const filename = this.plugin.app.vault.getAbstractFileByPath(ctx.sourcePath)?.name.replace(/ /g,'-');
    return `${filename?.substring(0, filename.lastIndexOf('.'))}-d2-${now}`;
  }

  getFolder = async (ctx: MarkdownPostProcessorContext) => {
    let exportPath = this.plugin.settings.exportPath;
    if (!exportPath.startsWith('/')) {
      const documentPath = this.plugin.app.vault.getAbstractFileByPath(ctx.sourcePath)?.parent;
      exportPath = `${documentPath?.path}/${exportPath}`;
    }

    const exists = await this.plugin.app.vault.adapter.exists(exportPath);
    if (!exists) {
      this.plugin.app.vault.createFolder(exportPath);
    }

    return exportPath;
  }

  getFilePath = async (ctx: MarkdownPostProcessorContext, type: string, title: string | null) => {
    let filename = this.getFilename(ctx);
    if (title) { filename = title; }
    const path = await this.getFolder(ctx);
    return `${path}${filename}.${type}`;
  }

  getFile = (fileName: string) => {

    let fName = fileName;
    if (fName.startsWith('/')) {
      fName = fName.substring(1);
    }

    const folderOrFile = this.plugin.app.vault.getAbstractFileByPath(fName);

    if (folderOrFile instanceof TFile) {
      return folderOrFile;
    }

    return undefined;
  }

  saveFile = async (ctx: MarkdownPostProcessorContext, type: string, data: string | null, buffer: ArrayBuffer | null, title: string | null) => {
    try {
      const filename = await this.getFilePath(ctx, type, title);
      const file = this.getFile(filename);

      if (data) {
        if (file) {
          await this.plugin.app.vault.modify(file, data);
        } else {
          await this.plugin.app.vault.create(filename, data);
        }
      }
      if (buffer) {
        if (file) {
          await this.plugin.app.vault.modifyBinary(file, buffer);
        } else {
          await this.plugin.app.vault.createBinary(filename, buffer);
        }
      }

      new Notice(`${t("GENERATE_LINK_NOTICE")}'${filename}'`);
      return filename;
    } catch (error) {
      new Notice(t("GENERATE_LINK_NOTICE_ERR"));
      console.error(error);
    }
  }

}
