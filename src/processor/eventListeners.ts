import { Menu, Notice, MarkdownView, MarkdownPostProcessorContext, MarkdownSectionInformation } from "obsidian";
import D2Plugin from "../main";
import { D2PluginModal } from "src/modal";
import { Utility } from "src/processor/utils";
import { t } from "lang/helpers"

export const addEventListeners = (plugin: D2Plugin, source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext, d2CodeBlock: string, d2Title: string, codeblockInfo: MarkdownSectionInformation, signal?: AbortSignal) => {
    const utility = new Utility(plugin);

    el.addEventListener('contextmenu', async (event) => {

        const menu = new Menu();
        menu.addItem((items: any) => {
            items
                .setTitle(t("COPY_SOURCE_CODE"))
                .setIcon('copy')
                .onClick(async () => {
                    await navigator.clipboard.writeText(source);
                    new Notice(t("COPY_SUCCESS_NOTICE"));
                })
        });

        menu.addSeparator()

        menu.addItem((items: any) => {
            items
                .setTitle(t("COPY_DIAGRAM"))
                .setIcon('clipboard-copy')
                .setSubmenu()
                .addItem((item: any) => {
                    item
                        .setTitle(t("COPY_PNG_BASE64"))
                        .setIcon('type')
                        .onClick(async () => {
                            const canvas = await utility.getDiagramData('canvas', source, el, ctx, signal);
                            await new Promise(resolve => requestAnimationFrame(resolve));
                            const base64 = await canvas.toDataURL("image/png");
                            await navigator.clipboard.writeText(base64);
                            new Notice(t("COPY_SUCCESS_NOTICE"));
                        });
                })
                .addItem((item: any) => {
                    item
                        .setTitle(t("COPY_SVG_XML"))
                        .setIcon('code')
                        .onClick(async () => {
                            const svg = (await utility.getDiagramData('svg', source, el, ctx, signal));
                            await navigator.clipboard.writeText(utility.getSvgXml(svg));
                            new Notice(t("COPY_SUCCESS_NOTICE"));
                        });
                })
                .addItem((item: any) => {
                    item
                        .setTitle(t("COPY_PNG_BLOB"))
                        .setIcon('image')
                        .onClick(async () => {
                            const canvas = await utility.getDiagramData('canvas', source, el, ctx, signal);
                            await new Promise(resolve => requestAnimationFrame(resolve));
                            renderToBlob(
                                canvas,
                                "image/png",
                                t("COPY_DIAGRAM_NOTICE_ERR"),
                                async (blob) => {
                                    await navigator.clipboard.write([
                                        new ClipboardItem({
                                            "image/png": blob
                                        })
                                    ]);
                                    new Notice(t("COPY_SUCCESS_NOTICE"));
                                });
                        });
                })
        })

        menu.addSeparator()

        menu.addItem((items: any) => {
            items
                .setTitle(t("EXPORT_DIAGRAM"))
                .setIcon('link')
                .setSubmenu()
                .addItem((item: any) => {
                    item
                        .setTitle(t("EXPORT_MD_DIAGRAM"))
                        .setIcon('file-type')
                        .onClick(async () => {
                            await utility.exportDiagram(ctx, d2CodeBlock, d2Title, true, null, null, 'md');
                        });
                })
                .addItem((item: any) => {
                    item
                        .setTitle(t("EXPORT_PNG_DIAGRAM"))
                        .setIcon('image')
                        .onClick(async () => {
                            const canvas = await utility.getDiagramData('canvas', source, el, ctx, signal);
                            await new Promise(resolve => requestAnimationFrame(resolve));
                            renderToBlob(canvas, "image/png", t("GENERATE_LINK_NOTICE_ERR"), async (blob) => {
                                const buffer = await blob.arrayBuffer();
                                await utility.exportDiagram(ctx, d2CodeBlock, d2Title, false, buffer, null, 'png');
                            })
                        })
                })
                .addItem((item: any) => {
                    item
                        .setTitle(t("EXPORT_SVG_DIAGRAM"))
                        .setIcon('file-code')
                        .onClick(async () => {
                            const svg = await utility.getDiagramData('svg', source, el, ctx, signal);
                            await new Promise(resolve => requestAnimationFrame(resolve));
                            await utility.exportDiagram(ctx, d2CodeBlock, d2Title, false, null, utility.getSvgXml(svg), 'svg');
                        });
                })
                .addItem((item: any) => {
                    item
                        .setTitle(t("EXPORT_WEBP_DIAGRAM"))
                        .setIcon('app-window')
                        .onClick(async () => {
                            const canvas = await utility.getDiagramData('canvas', source, el, ctx, signal);
                            await new Promise(resolve => requestAnimationFrame(resolve));
                            renderToBlob(canvas, "image/webp", t("GENERATE_LINK_NOTICE_ERR"), async (blob) => {
                                const buffer = await blob.arrayBuffer();
                                await utility.exportDiagram(ctx, d2CodeBlock, d2Title, false, buffer, null, 'webp');
                            })
                        });
                })
        });

        menu.addSeparator()

        menu.addItem((items: any) => {
            const viewMode = plugin.app.workspace.getActiveViewOfType(MarkdownView)?.getMode();
            if (viewMode === "preview") { items.setDisabled(true); }
            items
                .setTitle(t("GENERATE_LINK"))
                .setIcon('link')
                .setSubmenu()
                .addItem((item: any) => {
                    item
                        .setTitle(t("GENERATE_MD_LINK"))
                        .setIcon('file-type')
                        .onClick(async () => {
                            await utility.exportDiagramLink(ctx, d2CodeBlock, d2Title, codeblockInfo, true, null, null, '');
                        });
                })
                .addItem((item: any) => {
                    item
                        .setTitle(t("GENERATE_PNG_LINK"))
                        .setIcon('image')
                        .onClick(async () => {
                            const canvas = await utility.getDiagramData('canvas', source, el, ctx, signal);
                            await new Promise(resolve => requestAnimationFrame(resolve));
                            renderToBlob(canvas, "image/png", t("GENERATE_LINK_NOTICE_ERR"), async (blob) => {
                                const buffer = await blob.arrayBuffer();
                                await utility.exportDiagramLink(ctx, d2CodeBlock, d2Title, codeblockInfo, false, buffer, null, 'png');
                            })
                        })
                })
                .addItem((item: any) => {
                    item
                        .setTitle(t("GENERATE_SVG_LINK"))
                        .setIcon('file-code')
                        .onClick(async () => {
                            const svg = await utility.getDiagramData('svg', source, el, ctx, signal);
                            await new Promise(resolve => requestAnimationFrame(resolve));
                            await utility.exportDiagramLink(ctx, d2CodeBlock, d2Title, codeblockInfo, false, null, utility.getSvgXml(svg), 'svg');
                        });
                })
                .addItem((item: any) => {
                    item
                        .setTitle(t("GENERATE_WEBP_LINK"))
                        .setIcon('app-window')
                        .onClick(async () => {
                            const canvas = await utility.getDiagramData('canvas', source, el, ctx, signal);
                            await new Promise(resolve => requestAnimationFrame(resolve));
                            renderToBlob(canvas, "image/webp", t("GENERATE_LINK_NOTICE_ERR"), async (blob) => {
                                const buffer = await blob.arrayBuffer();
                                await utility.exportDiagramLink(ctx, d2CodeBlock, d2Title, codeblockInfo, false, buffer, null, 'webp');
                            })
                        });
                })
                .addItem((item: any) => {
                    item
                        .setTitle(t("GENERATE_PNG_BASE64_LINK"))
                        .setIcon('link-2')
                        .onClick(async () => {
                            const canvas = await utility.getDiagramData('canvas', source, el, ctx, signal);
                            await new Promise(resolve => requestAnimationFrame(resolve));
                            const base64 = await canvas.toDataURL("image/png");
                            await utility.exportDiagramLink(ctx, d2CodeBlock, d2Title, codeblockInfo, false, null, base64, 'base64');
                        });
                })
        });

        menu.showAtMouseEvent(event);
    });

    el.addEventListener('click', async (event) => {
        const diagram: any = el.querySelector('canvas') || el.querySelector('svg');
        if (diagram.classList.contains("d2-console-error-svg")) { return false; }
        let clonedDiagram: any = diagram.cloneNode(true);
        if (diagram instanceof HTMLCanvasElement) {
            const originalContext = diagram.getContext('2d');
            const clonedContext = clonedDiagram.getContext('2d');
            if (originalContext && clonedContext) {
                clonedContext.drawImage(diagram, 0, 0);
            }
        }
        const modal = new D2PluginModal(plugin.app, clonedDiagram);
        modal.open();
    });
}

const renderToBlob = (canvas: HTMLCanvasElement, MIME: string, errorMessage: string, handleBlob: (blob: Blob) => Promise<void>) => {
    try {
        canvas.toBlob(async (blob: Blob) => {
            try {
                await handleBlob(blob);
            } catch (error) {
                new Notice(errorMessage);
                console.error(error);
            }
        }, MIME);
    } catch (error) {
        new Notice(errorMessage);
        console.error(error);
    }
}