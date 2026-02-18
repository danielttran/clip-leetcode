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
});
