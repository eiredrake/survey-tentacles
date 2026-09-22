function createDeadlineRefresh(onDeadline) {
    let timer = null;

    return deadline => {
        if (timer) window.clearTimeout(timer);
        timer = null;
        if (!deadline) return;

        const delay = new Date(deadline).getTime() - Date.now();
        if (Number.isFinite(delay) && delay > 0) {
            timer = window.setTimeout(onDeadline, delay + 25);
        }
    };
}