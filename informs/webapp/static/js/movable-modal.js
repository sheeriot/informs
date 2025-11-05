document.addEventListener('DOMContentLoaded', function () {
    // Make Bootstrap 5 Modals Draggable
    const modalElements = document.querySelectorAll('.modal.draggable');

    modalElements.forEach(modalEl => {
        const dialog = modalEl.querySelector('.modal-dialog');
        const header = modalEl.querySelector('.modal-header');
        let isDragging = false;
        let offset = { x: 0, y: 0 };

        if (!header) {
            console.warn('[Movable Modal] No .modal-header found for a draggable modal. Dragging will not be enabled.');
            return;
        }

        header.style.cursor = 'move';

        const onMouseDown = (e) => {
            // Ignore if the click is on a button within the header (e.g., the close button)
            if (e.target.tagName === 'BUTTON' || e.target.parentElement.tagName === 'BUTTON') {
                return;
            }
            isDragging = true;
            offset.x = e.clientX - dialog.getBoundingClientRect().left;
            offset.y = e.clientY - dialog.getBoundingClientRect().top;

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp, { once: true });
        };

        const onMouseMove = (e) => {
            if (!isDragging) return;

            // Prevent default browser behavior (e.g., text selection)
            e.preventDefault();

            let newX = e.clientX - offset.x;
            let newY = e.clientY - offset.y;

            dialog.style.position = 'absolute';
            dialog.style.left = `${newX}px`;
            dialog.style.top = `${newY}px`;
            // Ensure the dialog does not get a 'margin-auto' which centers it
            dialog.style.margin = '0';
        };

        const onMouseUp = () => {
            isDragging = false;
            document.removeEventListener('mousemove', onMouseMove);
        };

        header.addEventListener('mousedown', onMouseDown);
    });
});
