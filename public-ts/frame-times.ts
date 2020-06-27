import { Widget } from "./widget";
import { DataProvider } from "./data";

type FTMetrics = {
    width: number,
    spacing: number,
    localStart: number,
    localEnd: number
};

export class FrameTimeGraph extends Widget {
    private start: number = 5;
    private end: number = 9;
    private dragOrigin: number | undefined = undefined;
    private firstBar: number = 0;
    private lastBar: number = 60;
    private soe: boolean = false;

    public constructor(canvas: HTMLCanvasElement) {
        super(canvas, true);
        DataProvider.getInstance().registerAutoscrollCallback(() => this.autoscrollCallback());
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
        const dataProvider = DataProvider.getInstance();
        const m = this.getMetrics();

        context.clearRect(0.0, 0.0, w, h);
        context.strokeStyle = "none";
        context.fillStyle = "#0080ff";

        let max = 0.0;
        let x = m.spacing;
        let firstBar = this.firstBar;
        let lastBar = this.lastBar;

        while(firstBar < lastBar && dataProvider.getFrameInfo(firstBar) === undefined) {
            firstBar++;
            x += m.width + m.spacing;
        }

        for(let i = firstBar; i < lastBar; i++) {
            const frameInfo = dataProvider.getFrameInfo(i);

            if(frameInfo === undefined) {
                lastBar = i;
                break;
            } else {
                const val = frameInfo.end - frameInfo.start;

                if(val > max) {
                    max = val;
                }
            }
        }

        for(let i = firstBar; i < lastBar; i++) {
            const frameInfo = dataProvider.getFrameInfo(i);
            const val = frameInfo.end - frameInfo.start;
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
        //If setFrameRange succeeds, every widgets inluding this graph will be rendered automatically.

        if(!DataProvider.getInstance().setFrameRange(Math.floor(this.start), Math.floor(this.end))) {
            this.render();
        }
    }

    private autoscrollCallback() {
        let dp = DataProvider.getInstance();

        if(dp.isAutoScrollEnabled()) {
            let viewWidth = this.end - this.start;
            let numBars = this.lastBar - this.firstBar;

            this.lastBar = dp.lastFrameNumber();
            this.firstBar = this.lastBar - numBars;

            this.end = this.lastBar - 1;
            this.start = this.end - viewWidth;

            this.updateTimeRange();
        }
    }
}
