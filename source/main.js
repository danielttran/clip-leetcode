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

    const imageReplacements = [];

    // Fetch all images via background script
    const fetchPromises = images.map(async (img) => {
      const src = img.getAttribute('src');
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
          imageReplacements.push({ src, alt, replacement: `![${alt}](${dataUrl})` });
        } catch (err) {
          console.error("Failed to fetch image:", src, err);
          // Fallback to original URL
          imageReplacements.push({ src, alt, replacement: `![${alt}](${src})` });
        }
      }
    });

    await Promise.all(fetchPromises);

    // Apply replacements
    let markdown = htmlContent;
    // Convert images first
    // We need to be careful about replacing strings. 
    // A safe way is to regex replace the img tag with the replacement.
    // But simpler for now: reuse our previous regex logic but use the mapped values.

    // Let's do a replace pass for each image we found and processed
    // Note: This naive replacement assumes unique src/alt combos or consistent replacement.
    // A robust way:
    images.forEach(img => {
      const src = img.getAttribute('src');
      const alt = img.getAttribute('alt') || '';
      const replacementObj = imageReplacements.find(r => r.src === src && r.alt === alt);
      if (replacementObj) {
        // Construct the img tag pattern roughly to replace it
        // or just simple regex replace for this specific image if possible.
        // Actually, let's use the replacement string we built.
        // We need to substitute the IMG TEXT in the HTML with the Markdown Image string.
        // This is tricky on raw HTML string.
        // Better approach: modify the DOM we parsed, then serialize descriptionContent? 
        // No, we are working on 'html' string which uses innerHTML.
      }
    });

    // Alternative: Just regex replace all Img tags, and inside the callback, look up the dataUrl?
    // Since we already fetched them, we can cache them by URL.
    const urlMap = {};
    imageReplacements.forEach(r => {
      urlMap[r.src] = r.replacement;
    });

    markdown = markdown.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/g, (match, src, alt) => {
      const key = imageReplacements.find(r => r.src === src && r.alt === alt);
      return key ? key.replacement : `![${alt}](${src})`;
    }).replace(/<img[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*>/g, (match, alt, src) => {
      const key = imageReplacements.find(r => r.src === src && r.alt === alt);
      return key ? key.replacement : `![${alt}](${src})`;
    });

    return markdown;
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

    // Try to get solution code
    const lines = Array.from(document.querySelectorAll('.view-line'));
    if (lines.length > 0) {
      const code = lines.map(line => line.innerText).join('\n');

      // Find language from DOM
      let language = '';
      const modeEl = document.querySelector('[data-mode-id]');
      if (modeEl) {
        language = modeEl.getAttribute('data-mode-id');
      }

      // Append code block to markdown
      value += `\n\n\`\`\`${language}\n${code}\n\`\`\``;
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
