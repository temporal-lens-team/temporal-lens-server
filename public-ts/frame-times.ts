import { Widget } from "./widget";
import { DataProvider } from "./data";

function clamp(x: number, min: number, max: number) {
    if(x < min) {
        return min;
    } else if(x > max) {
        return max;
    } else {
        return x;
    }
}

type FTMetrics = {
    width: number,
    spacing: number,
    localStart: number,
    localEnd: number
};

export class FrameTimeGraph extends Widget {
    private start: number = 5; //Note: it's quite bad to remember the frame index. It will be invalid soon
    private end: number = 9;
    private dragOrigin: number | undefined = undefined;
    private firstBar: number = 0;
    private lastBar: number = 60;
    private soe: boolean = false;

    public constructor(canvas: HTMLCanvasElement) {
        super(canvas, true);
    }

    private getMetrics(): FTMetrics {
        const w = this.canvas.width;
        const numBars = this.lastBar - this.firstBar;
        const width = Math.min(10.0, w / numBars);
        const spacing = (w - numBars * width) / (numBars + 1);

        const localStart = (this.start - this.firstBar) * (width + spacing) + spacing;
        const localEnd = (this.end + 1.0 - this.firstBar) * (width + spacing);

        return {
            width: width,
            spacing: spacing,
            localStart: localStart,
            localEnd: localEnd
        }
    }

    public renderInternal(context: CanvasRenderingContext2D, w: number, h: number) {
        const data = DataProvider.getInstance().getFrameData();
        const m = this.getMetrics();

        let x = m.spacing;
        context.clearRect(0.0, 0.0, w, h);
        context.strokeStyle = "none";
        context.fillStyle = "#0080ff";

        let max = 0.0;
        for(let i = this.firstBar; i < this.lastBar; i++) {
            const val = data[i].end - data[i].start;

            if(val > max) {
                max = val;
            }
        }

        for(let i = this.firstBar; i < this.lastBar; i++) {
            const val = data[i].end - data[i].start;
            const barH = val * h / max;

            context.fillRect(x, h - barH, m.width, barH);
            x += m.width + m.spacing;
        }

        context.lineWidth = 1.0;
        context.strokeStyle = "#808080";
        context.fillStyle = "rgba(128, 128, 128, 0.5)";

        context.fillRect(m.localStart, 0.0, m.localEnd - m.localStart, h);
        context.strokeRect(m.localStart + 0.5, 0.5, m.localEnd - m.localStart - 1.0, h - 1.0);
    }

    protected onMouseDown(button: number, x: number, y: number) {
        if(button === 0 && this.dragOrigin === undefined) {
            const m = this.getMetrics();

            if(x >= m.localStart && x <= m.localEnd) {
                this.dragOrigin = m.localStart - x;
            }
        }
    }

    protected onMouseUp(button: number, x: number, y: number) {
        if(button === 0) {
            this.realign();
        }
    }

    protected onMouseMove(x: number, y: number) {
        if(this.dragOrigin !== undefined) {
            const localStart = this.dragOrigin + x;
            const m = this.getMetrics();

            const start = (localStart - m.spacing) / (m.width + m.spacing) + this.firstBar;
            const w = this.end - this.start;

            this.start = start;
            this.end = start + w;
            this.render();
        }
    }

    protected onMouseWheel(deltaY: number) {
        if(this.dragOrigin !== undefined) {
            return;
        }

        let didSomething = false;

        if(deltaY < 0.0) { //<=> Increase the window size
            if(this.soe) {
                this.start -= 1;
            } else {
                this.end += 1;
            }

            didSomething = true;
        } else { //<=> Decrease the window size
            if(this.soe) {
                if(this.end > this.start) {
                    this.end -= 1;
                    didSomething = true;
                }
            } else {
                if(this.start < this.end) {
                    this.start += 1;
                    didSomething = true;
                }
            }
        }

        if(didSomething) {
            this.soe = !this.soe;
            this.updateTimeRange();
        }
    }

    protected onMouseLeave() {
        this.realign();
    }

    private realign() {
        if(this.dragOrigin !== undefined) {
            const w = this.end - this.start;
            this.start = Math.round(this.start);
            this.end = this.start + w;

            this.dragOrigin = undefined;
            this.updateTimeRange();
        }
    }

    private updateTimeRange() {
        //Note that calling this function will also re-render every widgets, inluding this graph
        const dataProvider = DataProvider.getInstance();
        const frameData = dataProvider.getFrameData();
        const minIdx = Math.max(this.start, 0);
        const maxIdx = Math.min(this.end, frameData.length - 1);

        dataProvider.setTimeRange(frameData[Math.floor(minIdx)].start, frameData[Math.floor(maxIdx)].end);
    }
}
