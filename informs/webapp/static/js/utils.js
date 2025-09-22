function copyCoordinates(buttonElement) {
    const textToCopy = buttonElement.dataset.copyText;
    navigator.clipboard.writeText(textToCopy).then(() => {
        const originalIcon = buttonElement.innerHTML;
        buttonElement.innerHTML = '<i class="bi bi-check-lg text-success"></i>'; // Success icon
        setTimeout(() => {
            buttonElement.innerHTML = originalIcon;
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy text: ', err);
    });
}
