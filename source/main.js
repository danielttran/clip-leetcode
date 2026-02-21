const MAIN_COLOR = "#0CB345";
const ALT_COLOR = "transparent";
const TEXT_COLOR = "#ffffff";
const BUTTON_ACTION_TEXT = "Copied!";
const BUTTON_ACTION_WAIT_TIME = 1000;
const WAIT_TIME = 1000;

// Object containing button text and extra styles
const BUTTON_MAP = {
  copy: {
    text: "Copy",
    extra: "margin-right: 1rem; width: 80px;",
  },
  copyMarkdown: {
    text: "Copy Markdown",
    extra: "width: 128px;",
  },
};

// Object containing html tags and their corresponding markdown syntax
const MARKDOWN = {
  "<div>": "",
  "</div>": "",
  "<p>": "",
  "</p>": "",
  "<u>": "",
  "</u>": "",
  "<ol>": "",
  "</ol>": "",
  "<ul>": "",
  "</ul>": "",
  "<li>": "- ",
  "</li>": "",
  "&nbsp;": "",
  "<em>": "",
  "</em>": "",
  "<strong>Input</strong>": "Input\n",
  "<strong>Output</strong>": "Output\n",
  "<strong>Explanation</strong>": "Explanation\n",
  "<strong>Input:</strong>": "Input:",
  "<strong>Output:</strong>": "Output:",
  "<strong>Explanation:</strong>": "Explanation:",
  "<strong>Input: </strong>": "Input: ",
  "<strong>Output: </strong>": "Output: ",
  "<strong>Explanation: </strong>": "Explanation: ",
  '<strong class="example">Example': "**Example",
  "<strong>": "**",
  "</strong>": "** ",
  "<pre>": "\n```\n",
  "</pre>": "```\n\n",
  "<code>": "`",
  "</code>": "`",
  "&lt;": "<",
  "&gt;": ">",
  "<sup>": "^",
  "</sup>": "",
  "	": "", // special tab
  "<span.*?>": "",
  "</span>": "",
  '<font face="monospace">': "",
  "</font>": "",
};

const copyText = async (action, targetObj) => {
  // Get the current URL.
  const url = window.location.href;


  // Try to find the elements for the old version of the website.
  let title;
  let descriptionContent;
  let text;
  let html;

  // Get current title and description using the stored selectors
  const titleEl = document.querySelector(targetObj.titleSelector);
  const descEl = document.querySelector(targetObj.descriptionSelector);

  if (!titleEl || !descEl) {
    console.error("Could not find title or description elements to copy.");
    return;
  }

  // Get title
  title = titleEl.innerText;

  // Get main problem description
  descriptionContent = descEl;

  // Clean the content to be copied
  text = descriptionContent.textContent.replace(/(\n){2,}/g, "\n\n").trim();
  html = descriptionContent.innerHTML;

  // Removes unwanted elements.
  html = html
    .replace(/<div class=".*?" data-headlessui-state=".*?">/g, "")
    .replace(
      /<div id=".*?" aria-expanded=".*?" data-headlessui-state=".*?">/g,
      ""
    );

  // Helper to process markdown conversion (including async image fetching)
  const processMarkdown = async (htmlContent) => {
    // Find all image tags
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    const images = Array.from(doc.querySelectorAll('img'));

    // Fetch all images via background script
    const fetchPromises = images.map(async (img) => {
      let src = img.getAttribute('src');

      // Resolve relative URLs
      if (src && !src.startsWith('http') && !src.startsWith('data:')) {
        try {
          src = new URL(src, window.location.origin).href;
        } catch (e) {
          // ignore invalid URLs
        }
      }

      const alt = img.getAttribute('alt') || '';
      if (src) {
        try {
          const dataUrl = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: "fetch_image", url: src }, (response) => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else if (response && response.success) {
                resolve(response.data);
              } else {
                reject(new Error(response ? response.error : 'Unknown error'));
              }
            });
          });
          const textNode = doc.createTextNode(`![${alt}](${dataUrl})`);
          img.parentNode.replaceChild(textNode, img);
        } catch (err) {
          console.error("Failed to fetch image:", src, err);
          // Fallback to original URL
          const textNode = doc.createTextNode(`![${alt}](${src})`);
          img.parentNode.replaceChild(textNode, img);
        }
      } else {
        const textNode = doc.createTextNode('');
        img.parentNode.replaceChild(textNode, img);
      }
    });

    await Promise.allSettled(fetchPromises);

    return doc.body.innerHTML;
  };

  let value;
  if (action === "copyMarkdown") {
    let htmlToMarkdown = html;

    // Process images and convert to Base64/Markdown
    htmlToMarkdown = await processMarkdown(htmlToMarkdown);

    // Replace HTML elements with markdown equivalents.
    Object.keys(MARKDOWN).forEach((key) => {
      htmlToMarkdown = htmlToMarkdown.replace(
        new RegExp(key, "g"),
        MARKDOWN[key]
      );
    });
    // Format the markdown string and add the title and URL.
    value = `# [${title}](${url})\n\n${htmlToMarkdown
      .replace(/(\n){2,}/g, "\n\n")
      .trim()}`;

    // Try to get solution code from Monaco directly
    try {
      const code = await new Promise((resolve) => {
        // Create an ID for our communication
        const eventId = "leetcode-clip-code-" + Date.now();

        // Listen for the response
        const listener = (event) => {
          if (event.source !== window || !event.data || event.data.type !== eventId) return;
          window.removeEventListener("message", listener);
          resolve(event.data.code);
        };
        window.addEventListener("message", listener);

        // Inject script to extract Monaco content from page context
        const script = document.createElement("script");
        script.textContent = `
          (function() {
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
                            // Default to first snippet or target language if known
                            codeStr = snippets[0].code;
                            langStr = snippets[0].langSlug;
                         }
                     }
                 } catch (e) {}
              }

              // Priority 3: local storage where LeetCode caches user code drafts
              if (!codeStr) {
                  const keys = Object.keys(window.localStorage);
                  // Find newest or most relevant problem slug code cache
                  const slugObj = keys.find(k => k.endsWith('_code') || k.includes('pascal'));
                  if (slugObj) {
                     codeStr = window.localStorage.getItem(slugObj);
                  }
              }
            } catch (e) {
                console.error("Content extraction error", e);
            }
            window.postMessage({ type: "${eventId}", code: { text: codeStr, language: langStr } }, "*");
          })();
        `;
        document.body.appendChild(script);

        // Cleanup script
        setTimeout(() => {
          script.remove();
          // Fail-safe resolution if Monaco wasn't found
          resolve(null);
        }, 500);
      });

      if (code && code.text) {
        // Found code via React/localStorage API
        let parsedLanguage = code.language || "";
        if (!parsedLanguage) {
          const modeEl = document.querySelector('[data-mode-id]');
          if (modeEl) parsedLanguage = modeEl.getAttribute('data-mode-id');
        }
        value += `\n\n\`\`\`${parsedLanguage}\n${code.text}\n\`\`\``;
      } else {
        // Fallback to DOM extraction if script fails
        const lines = Array.from(document.querySelectorAll('.view-line'));
        if (lines.length > 0) {
          // view-line includes span children that hold spaces nicely, but ensure formatting
          const domCode = lines.map(line => line.textContent).join('\n');
          let language = '';
          const modeEl = document.querySelector('[data-mode-id]');
          if (modeEl) {
            language = modeEl.getAttribute('data-mode-id');
          }
          value += `\n\n\`\`\`${language}\n${domCode}\n\`\`\``;
        }
      }
    } catch (e) {
      console.error("Failed to extract code:", e);
    }
  } else {
    // Format the plain text string and add the title and URL.
    value = `URL: ${url}\n\n${title}\n\n${text}`;
  }

  // Copy to clipboard
  try {
    await navigator.clipboard.writeText(value);
  } catch (err) {
    console.error('Failed to copy text: ', err);
    // Fallback (though execCommand might fail in async function without user gesture sometimes, 
    // but usually the initial click grants permission for a short window. 
    // If the fetch takes too long, this might fail.)
    const hiddenElement = document.createElement("textarea");
    hiddenElement.value = value;
    document.body.appendChild(hiddenElement);
    hiddenElement.select();
    document.execCommand("copy");
    document.body.removeChild(hiddenElement);
  }
};

// Set a timeout to give the page time to load before adding the buttons.
setTimeout(() => {
  // Target Layouts with Selectors instead of DOM elements
  const TARGETS = [
    {
      name: "originalLayout",
      titleSelector: "[data-cy=question-title]",
      descriptionSelector: "[data-track-load=description_content]",
      useStyle: true,
      style: `
        position: absolute;
        top: 1rem;
        right: 0;
        display: flex;
      `,
      classList: [],
    },
    {
      name: "newLayout",
      titleSelector: ".mr-2.text-lg.font-medium.text-label-1.dark\\:text-dark-label-1",
      descriptionSelector: "[data-track-load=description_content]",
      useStyle: false,
      style: "",
      classList: [
        "mt-1",
        "inline-flex",
        "min-h-20px",
        "items-center",
        "space-x-2",
        "align-top",
      ],
    },
    {
      name: "contestLayout",
      titleSelector: "#base_content > div.container > div > div > div.question-title.clearfix > h3",
      descriptionSelector: "div.question-content.default-content",
      useStyle: true,
      style: `display: flex;`,
      classList: [],
    },
    {
      name: "dynamicLayout",
      titleSelector: ".text-title-large",
      descriptionSelector: "[data-track-load=description_content]",
      useStyle: true,
      style: `display: flex;`,
      classList: [],
    },
  ];

  // Determine which target layout.
  let targetElement;
  let targetObj;

  // Filter target DOM that is not null
  const filteredTarget = TARGETS.filter((t) => {
    const el = document.querySelector(t.titleSelector);
    if (el) {
      return el;
    }
  });

  if (filteredTarget.length > 0) {
    targetObj = filteredTarget[0];
    targetElement = document.querySelector(targetObj.titleSelector);
  }

  // Create a container for the buttons.
  const buttonContainer = document.createElement("div");

  // Style button by layout
  if (targetObj) {
    if (targetObj.useStyle) {
      buttonContainer.style = targetObj.style;
    } else {
      targetObj.classList.forEach((i) => buttonContainer.classList.add(i));
    }
  }

  if (targetElement) {
    // Set the parent element's position to relative to allow for absolute positioning of the button container.
    targetElement.parentElement.style = "position: relative; align-items: center";

    // Set the base style for the buttons.
    const buttonStyle = `
      padding: 4px 4px;
      color: ${MAIN_COLOR};
      background: ${ALT_COLOR};
      border-radius: 12px;
      border: 1px solid ${MAIN_COLOR};
      font-size: 10px;
      cursor: pointer;
      text-align: center;
    `;

    const buttons = ["copy", "copyMarkdown"];
    buttons.forEach((button) => {
      const _button = document.createElement("div");
      // Styling.
      _button.innerText = BUTTON_MAP[button].text;
      _button.style = BUTTON_MAP[button].extra
        ? buttonStyle + BUTTON_MAP[button].extra
        : buttonStyle;

      // Event listeners.
      _button.addEventListener("click", () => {
        // Pass the target object which contains selectors, NOT the stale DOM element
        copyText(button, targetObj);
        _button.innerText = BUTTON_ACTION_TEXT;
        setTimeout(
          () => (_button.innerText = BUTTON_MAP[button].text),
          BUTTON_ACTION_WAIT_TIME
        );
      });

      _button.addEventListener("mouseenter", () => {
        _button.style.background = MAIN_COLOR;
        _button.style.color = TEXT_COLOR;
      });

      _button.addEventListener("mouseleave", () => {
        _button.style.background = ALT_COLOR;
        _button.style.color = MAIN_COLOR;
      });

      // Add the button to the button container.
      buttonContainer.append(_button);
    });

    // Add the button container to the parent element.
    targetElement.parentElement.appendChild(buttonContainer);
  }
}, WAIT_TIME);
