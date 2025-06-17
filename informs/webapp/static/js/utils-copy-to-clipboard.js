function copyToClipboard(event, inputId) {
    const button = event.currentTarget;
    const inputElement = document.getElementById(inputId);

    if (inputElement) {
        navigator.clipboard.writeText(inputElement.value).then(() => {
            const originalIcon = button.innerHTML;
            button.innerHTML = '<i class="bi bi-check-lg"></i>'; // Change icon to a checkmark

            setTimeout(() => {
                button.innerHTML = originalIcon; // Revert icon after a short delay
            }, 1500);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
        });
    } else {
        console.error(`Element with id '${inputId}' not found.`);
    }
}

// Ensure the function is globally accessible if this file is loaded as a module.
if (typeof window.copyToClipboard === 'undefined') {
    window.copyToClipboard = copyToClipboard;
}
