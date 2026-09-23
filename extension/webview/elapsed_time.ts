export function timeItHasTaken(secondsSoFar: number): string {
    const seconds = Math.max(0, Math.round(secondsSoFar));
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
        return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
    }
    if (minutes > 0) {
        return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
    }
    return `${seconds}s`;
}

export function onTheClock(secondsSoFar: number): string {
    const seconds = Math.max(0, Math.round(secondsSoFar));
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const afterTheMinutes = String(seconds % 60).padStart(2, "0");
    if (hours > 0) {
        return `${hours}:${String(minutes % 60).padStart(2, "0")}:${afterTheMinutes}`;
    }
    return `${minutes}:${afterTheMinutes}`;
}
