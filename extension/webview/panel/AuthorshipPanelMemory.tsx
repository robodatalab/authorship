import { useEffect, useState } from "react";
import "./AuthorshipPanelMemory.css";

export interface MemoryInUse {
    gpu: { used: number; limit: number };
    process: number;
    machine: number;
    serving: string | null;
}

interface MemoryReading {
    gpu: number;
    process: number;
    serving: string | null;
    at: number;
}

/** How many readings the plot keeps — at the poll interval, a few minutes' worth. */
const HISTORY = 120;

const PLOT_WIDTH = 240;
const PLOT_HEIGHT = 48;

/** null means the server did not answer; otherwise what the model is holding. */
export function AuthorshipPanelMemory({
    memory,
}: {
    memory: MemoryInUse | null;
}) {
    /**
     * The readings behind the plot. Which model was loaded is recorded alongside
     * each one rather than as its own timeline, so the bands drawn over the plot
     * cannot drift out of step with it.
     */
    const [readings, setReadings] = useState<MemoryReading[]>([]);

    useEffect(() => {
        if (memory === null) {
            return;
        }
        setReadings((kept) =>
            [
                ...kept,
                {
                    gpu: memory.gpu.used,
                    process: memory.process,
                    serving: memory.serving,
                    at: Date.now(),
                },
            ].slice(-HISTORY),
        );
    }, [memory]);

    if (memory === null) {
        return (
            <div className="authorship-panel-memory">
                <div className="authorship-panel-offline">
                    Model server offline
                </div>
            </div>
        );
    }

    // The GPU's ceiling is the number a load has to fit under; the machine's RAM
    // is what the process is killed over. Each bar is read against its own.
    return (
        <div className="authorship-panel-memory">
            <MemoryGauge
                name="GPU"
                used={memory.gpu.used}
                of={memory.gpu.limit}
            />
            <MemoryGauge
                name="Process"
                used={memory.process}
                of={memory.machine}
            />
            <ModelsLoadedOverThePlot readings={readings} />
            <MemoryPlot
                readings={readings}
                ceiling={Math.max(memory.gpu.limit, memory.machine)}
            />
        </div>
    );
}

function MemoryGauge({
    name,
    used,
    of,
}: {
    name: string;
    used: number;
    of: number;
}) {
    const share = of > 0 ? used / of : 0;

    return (
        <div className="authorship-panel-gauge">
            <span className="authorship-panel-gauge-name">{name}</span>
            <span className="authorship-panel-gauge-track">
                <span
                    className={
                        share > 1
                            ? "authorship-panel-gauge-fill authorship-panel-gauge-over"
                            : "authorship-panel-gauge-fill"
                    }
                    style={{ width: `${Math.min(share, 1) * 100}%` }}
                />
            </span>
            <span className="authorship-panel-gauge-figure">
                {`${used.toFixed(1)} / ${of.toFixed(0)} GB`}
            </span>
        </div>
    );
}

function shortName(model: string): string {
    return model.split("/").pop() ?? model;
}

/** Whole seconds under a minute, then minutes and seconds. */
function duration(milliseconds: number): string {
    const whole = Math.round(milliseconds / 1000);
    if (whole < 60) {
        return `${whole}s`;
    }
    return `${Math.floor(whole / 60)}m ${whole % 60}s`;
}

/** A box per run of the same model, over the stretch of plot it was loaded for. */
function ModelsLoadedOverThePlot({ readings }: { readings: MemoryReading[] }) {
    const runs: { model: string; from: number; to: number }[] = [];
    let start = 0;
    while (start < readings.length) {
        const model = readings[start].serving;
        let end = start;
        while (end + 1 < readings.length && readings[end + 1].serving === model) {
            end += 1;
        }
        if (model !== null) {
            runs.push({ model, from: start, to: end });
        }
        start = end + 1;
    }

    return (
        <div className="authorship-panel-bands">
            {runs.map((run) => (
                <span
                    key={run.from}
                    className="authorship-panel-band"
                    style={{
                        left: `${(run.from / (HISTORY - 1)) * 100}%`,
                        width: `${((run.to - run.from) / (HISTORY - 1)) * 100}%`,
                    }}
                    title={`${run.model} — ${duration(
                        readings[run.to].at - readings[run.from].at,
                    )} and counting`}
                >
                    {shortName(run.model)}
                </span>
            ))}
        </div>
    );
}

/**
 * The two histories over one scale, so the GPU's share of the machine reads at
 * a glance. Hand-drawn SVG: the view's policy admits no script but its own.
 */
function MemoryPlot({
    readings,
    ceiling,
}: {
    readings: MemoryReading[];
    ceiling: number;
}) {
    function points(read: (reading: MemoryReading) => number): string {
        const step = PLOT_WIDTH / (HISTORY - 1);
        return readings
            .map((reading, index) => {
                const x = index * step;
                const y =
                    PLOT_HEIGHT -
                    (ceiling > 0 ? read(reading) / ceiling : 0) * PLOT_HEIGHT;
                return `${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(" ");
    }

    return (
        <svg
            className="authorship-panel-plot"
            viewBox={`0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`}
            preserveAspectRatio="none"
        >
            {readings.length > 1 && (
                <>
                    <polyline
                        className="authorship-panel-plot-gpu"
                        points={points((reading) => reading.gpu)}
                    />
                    <polyline
                        className="authorship-panel-plot-process"
                        points={points((reading) => reading.process)}
                    />
                </>
            )}
        </svg>
    );
}
