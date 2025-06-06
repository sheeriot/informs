function copyCoordinates(event) {
    const button = event.currentTarget;
    const coordinatesInput = document.getElementById('coordinates');

    if (coordinatesInput) {
        navigator.clipboard.writeText(coordinatesInput.value).then(() => {
            // Provide feedback that the copy was successful
            const originalIcon = button.innerHTML;
            button.innerHTML = '<i class="bi bi-check-lg"></i>'; // Change icon to a checkmark

            setTimeout(() => {
                button.innerHTML = originalIcon; // Revert icon after a short delay
            }, 1500);
        }).catch(err => {
            console.error('Failed to copy coordinates: ', err);
        });
    }
}

// Ensure xxConfig is defined for debug logging, if not already defined globally.
if (typeof xxConfig === 'undefined') {
    var xxConfig = { debug: false };
    // It's good practice to inform that xxConfig was auto-defined,
    // if debugging is a concern.
    // console.warn("xxConfig was not defined. Defaulting xxConfig.debug to false for utils-copy-coordinates.js.");
}

// If copyCoordinates is intended to be called from HTML (e.g., onclick),
// it needs to be on the window object.
if (typeof window.copyCoordinates === 'undefined') {
    window.copyCoordinates = copyCoordinates;
}
