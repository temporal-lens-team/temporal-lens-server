import { Widget } from "./widget";
import { DataProvider } from "./data";
import { TooltipManager, TooltipRect } from "./tooltip-manager";
import { escapeHTML, formatUnits, TIME_UNITS } from "./common";

export class FrameTimeGraph extends Widget {
    private viewStart: number | undefined = undefined;
    private viewEnd: number = 0.0;
    private dragingView: boolean = false;
    private drag1: number = 0.0;
    private drag2: number = 0.0;
    private prevFrameNumber: number | undefined = undefined;
    private lastMax: number = 1.0;

    public constructor(canvas: HTMLDivElement) {
        super(canvas);

        const dp = DataProvider.getInstance();
        dp.onTimeRangeChanged.register(() => this.onTimeRangeChanged());
        dp.onFrameDataChanged.register(() => this.onFrameDataAcquired());

        this.alwaysHandleMouseMove = true;
    }

    private onTimeRangeChanged() {
         if(this.prevFrameNumber === undefined && this.viewStart !== undefined) {
            this.viewStart = undefined;
            this.render();
        }
    }

    private onFrameDataAcquired() {
        if(this.prevFrameNumber === undefined) {
            return;
        }

        if(this.viewStart !== undefined) {
            //Duct tape hack!!! Fix it!!!
            const fd = DataProvider.getInstance().getFrameData();

            for(let i = 0; i < fd.length; i++) {
                if(fd[i].number === this.prevFrameNumber) {
                    const len = this.viewEnd - this.viewStart;

                    this.viewStart = i;
                    this.viewEnd = i + len;
                    break;
                }
            }

            this.render();
        }

        this.prevFrameNumber = undefined;
    }

    protected renderInternal(context: CanvasRenderingContext2D, w: number, h: number) {
        const dataProvider = DataProvider.getInstance();

        const numBars = 60;
        const width = Math.min(10.0, w / numBars);
        const spacing = (w - numBars * width) / (numBars + 1);

        context.clearRect(0.0, 0.0, w, h);
        context.strokeStyle = "none";
        context.fillStyle = "#0080ff";

        this.lastMax = 0.0;
        let x = spacing;

        for(let i = 0; i < numBars; i++) {
            const frameInfo = dataProvider.getFrameInfo(i);
            if(frameInfo === undefined) {
                break;
            }

            const val = frameInfo.end - frameInfo.start;
            if(val > this.lastMax) {
                this.lastMax = val;
            }
        }

        for(let i = 0; i < numBars; i++) {
            const frameInfo = dataProvider.getFrameInfo(i);
            if(frameInfo === undefined) {
                break;
            }

            const val = frameInfo.end - frameInfo.start;
            const barH = val * h / this.lastMax;

            context.fillRect(x, h - barH, width, barH);
            x += width + spacing;
        }

        if(this.viewStart !== undefined) {
            context.lineWidth = 1.0;
            context.strokeStyle = "#808080";
            context.fillStyle = "rgba(128, 128, 128, 0.2)";

            const vs = this.viewStart * (width + spacing) + spacing;
            const vw = (this.viewEnd + 1) * (width + spacing) - vs;

            context.fillRect(vs, 0.0, vw, h);
            context.strokeRect(vs + 0.5, 0.5, vw - 1.0, h - 1.0);
        }
    }

    private pos2frame(x: number): number {
        const numBars = 60;
        const width = Math.min(10.0, this.canvas.width / numBars);
        const spacing = (this.canvas.width - numBars * width) / (numBars + 1);
        const ret = (x - spacing) / (width + spacing);

        if(ret < 0.0) {
            return 0.0;
        } else if(ret > numBars - 1) {
            return numBars - 1;
        } else {
            return ret;
        }
    }

    public onMouseDown(button: number, x: number, y: number) {
        if(button === 0 && !this.dragingView) {
            this.dragingView = true;
            this.drag1       = this.pos2frame(x);
            this.drag2       = this.drag1;
            this.viewStart   = Math.floor(this.drag1);
            this.viewEnd     = this.viewStart;

            this.render();
        }
    }

    public onMouseUp(button: number, x: number, y: number) {
        if(button === 0 && this.dragingView) {
            this.dragingView = false;

            const dp = DataProvider.getInstance();
            const fd = dp.getFrameData();

            this.prevFrameNumber = fd[this.viewStart].number;
            dp.setTimeRange(fd[this.viewStart].start, fd[this.viewEnd].end);
        }
    }

    public onMouseMove(x: number, y: number) {
        if(this.viewStart !== undefined && this.dragingView) {
            this.drag2 = this.pos2frame(x);

            if(this.drag1 <= this.drag2) {
                this.viewStart = Math.floor(this.drag1);
                this.viewEnd = Math.floor(this.drag2);
            } else {
                this.viewStart = Math.floor(this.drag2);
                this.viewEnd = Math.floor(this.drag1);
            }

            this.render();
        } else {
            const fd = DataProvider.getInstance().getFrameData();
            const fid = Math.floor(this.pos2frame(x));
            const frame = fd[fid];
            
            if(frame === undefined) {
                return;
            }

            const numBars = 60;
            const width = Math.min(10.0, this.canvas.width / numBars);
            const spacing = (this.canvas.width - numBars * width) / (numBars + 1);

            const fx = spacing + fid * (spacing + width);
            const fh = (frame.end - frame.start) / this.lastMax * this.canvas.clientHeight;
            const fy = this.canvas.clientHeight - fh;

            if(x >= fx && x <= fx + width && y >= fy && y <= fy + fh) {
                TooltipManager.getInstance().displayTooltip(new TooltipRect(this.canvas, fx, fy, width, fh), () => `
                    <strong>${escapeHTML("Frame #" + frame.number)}</strong><br/>
                    <strong>Duration: </strong>${formatUnits(frame.duration, TIME_UNITS)}
                `);
            }
        }
    }
}
