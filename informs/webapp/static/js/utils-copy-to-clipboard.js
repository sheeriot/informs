function copyToClipboard(event, elementId) {
    const button = event.currentTarget;
    const element = document.getElementById(elementId);

    if (element) {
        const textToCopy = (element.tagName.toUpperCase() === 'INPUT' || element.tagName.toUpperCase() === 'TEXTAREA')
            ? element.value
            : element.textContent || element.innerText;

        navigator.clipboard.writeText(textToCopy).then(() => {
            const originalIcon = button.innerHTML;
            button.innerHTML = '<i class="bi bi-check-lg"></i>'; // Change icon to a checkmark

            setTimeout(() => {
                button.innerHTML = originalIcon; // Revert icon after a short delay
            }, 1500);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
        });
    } else {
        console.error(`Element with id '${elementId}' not found.`);
    }
}

// Ensure the function is globally accessible if this file is loaded as a module.
if (typeof window.copyToClipboard === 'undefined') {
    window.copyToClipboard = copyToClipboard;
}
