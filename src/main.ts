import { MarkdownView, Plugin, addIcon } from "obsidian";

import { D2PluginSettings, D2SettingsTab, DEFAULT_SETTINGS } from "./settings";
import { D2Processor } from "./processor/processor";
import { RecompileIcon } from "./constants";
import { t } from "lang/helpers"

export default class D2Plugin extends Plugin {
  settings: D2PluginSettings;
  processor: D2Processor;

  async onload() {
    addIcon("recompile", RecompileIcon);
    await this.loadSettings();
    this.addSettingTab(new D2SettingsTab(this.app, this));

    const processor = new D2Processor(this);
    this.registerMarkdownCodeBlockProcessor("d2", processor.attemptExport);

    this.processor = processor;

  } 

  async refreshEditor() {
    this.app.workspace.getLeavesOfType("markdown").forEach(async (leaf) => {
      const state = leaf.getViewState();
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      const scrollInfo = view?.editor.getScrollInfo();
      await leaf.setViewState({ type: "empty" });
      await leaf.setViewState(state);
      const scrollEl = document.querySelector('.cm-scroller');
      if (scrollEl) {
        scrollEl.scrollTo({
          top: scrollInfo?.top, 
          left: scrollInfo?.left,
          behavior: "instant",
        });
      }
    });
  }

  onunload() {
    const abortControllers = this.processor.abortControllerMap.values();
    Array.from(abortControllers).forEach((controller) => {
      controller.abort();
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
