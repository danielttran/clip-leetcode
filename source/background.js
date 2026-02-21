chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "fetch_image") {
        fetch(message.url)
            .then((response) => response.blob())
            .then((blob) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    sendResponse({ success: true, data: reader.result });
                };
                reader.readAsDataURL(blob);
            })
            .catch((error) => {
                console.error("Error fetching image:", error);
                sendResponse({ success: false, error: error.message });
            });
        return true; // Keep the message channel open for async response
    }

    if (message.action === "extract_code") {
        // Execute extraction script in the main page context to bypass CSP
        chrome.scripting.executeScript({
            target: { tabId: sender.tab.id },
            world: "MAIN",
            func: () => {
                let codeStr = "";
                let langStr = "";
                try {
                    // Priority 1: Direct Monaco Editor Instance
                    const editorInstance = window.lcMonaco || window.monaco;
                    if (editorInstance && editorInstance.editor) {
                        const models = editorInstance.editor.getModels();
                        if (models.length > 0) {
                            codeStr = models[0].getValue();
                            langStr = models[0].getLanguageId();
                        }
                    }

                    // Priority 2: Next.js state for default snippets (if no typing happened)
                    if (!codeStr && window.__NEXT_DATA__ && window.__NEXT_DATA__.props) {
                        try {
                            const queries = window.__NEXT_DATA__.props.pageProps.dehydratedState.queries;
                            if (queries && queries.length > 1) {
                                const snippets = queries[1].state.data.question.codeSnippets;
                                if (snippets && snippets.length > 0) {
                                    codeStr = snippets[0].code;
                                    langStr = snippets[0].langSlug;
                                }
                            }
                        } catch (e) { }
                    }

                    // Priority 3: local storage where LeetCode caches user code drafts
                    if (!codeStr) {
                        const keys = Object.keys(window.localStorage);
                        const slugObj = keys.find(k => k.endsWith('_code') || k.includes('pascal'));
                        if (slugObj) {
                            codeStr = window.localStorage.getItem(slugObj);
                        }
                    }
                } catch (e) {
                    console.error("Content extraction error", e);
                }
                return { text: codeStr, language: langStr };
            }
        }).then((injectionResults) => {
            if (injectionResults && injectionResults[0] && injectionResults[0].result) {
                sendResponse({ success: true, data: injectionResults[0].result });
            } else {
                sendResponse({ success: false });
            }
        }).catch((err) => {
            console.error("Scripting error:", err);
            sendResponse({ success: false, error: err.message });
        });

        return true; // Keep message channel open
    }
});
