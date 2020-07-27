import { Widget } from "./widget";
import { DataProvider } from "./data";
import { formatTime } from "./common";
import { TooltipManager } from "./tooltip-manager";

const pointSize = 4;

export type PlotPoint = {
    t: number,
    y: number
}

type MousePoint = {
    pid: number,
    mouseX: number,
    mouseY: number,
    left: boolean
}

export interface PlotDataAccessor<T>
{
    (data: T): PlotPoint;
}

export interface PlotLabeler<T>
{
    (data: T): string;
}

export class Plot<T> extends Widget {
    private data: T[] = [];
    private accessor: PlotDataAccessor<T> | undefined = undefined;
    private mousePoint: MousePoint | undefined = undefined;
    private lastMax: number = 1.0;
    private labeler: PlotLabeler<T> | undefined = undefined;

    public constructor(elem: HTMLDivElement) {
        super(elem);
        this.alwaysHandleMouseMove = true;
    }

    protected renderInternal(ctx: CanvasRenderingContext2D, w: number, actualH: number) {
        if(this.accessor === undefined) {
            return;
        }

        const h = actualH - 2 * pointSize;
        const dp = DataProvider.getInstance();
        const data = [];
        const interp = this.element.classList.contains("interpolate");

        ctx.clearRect(0, 0, w, actualH);
        data.length = this.data.length;

        //Determine max
        this.lastMax = -Infinity;

        for(let i = 0; i < this.data.length; i++) {
            const pt = this.accessor(this.data[i]);

            if(pt.y > this.lastMax) {
                this.lastMax = pt.y;
            }

            pt.t = Math.max(dp.remapTime(pt.t), 0.0) * w;
            data[i] = pt;
        }

        if(data.length >= 1) {
            //Background
            let prevVal = (1.0 - data[0].y / this.lastMax) * h + pointSize;

            ctx.fillStyle = "rgba(152, 195, 121, 0.25)";
            ctx.beginPath();
            ctx.moveTo(0, h + pointSize);
            ctx.lineTo(0, prevVal);

            if(interp) {
                for(const pt of data) {
                    prevVal = (1.0 - pt.y / this.lastMax) * h + pointSize;
                    ctx.lineTo(pt.t, prevVal);
                }
            } else {
                for(let i = 1; i < data.length; i++) {
                    const pt = data[i];
                    ctx.lineTo(pt.t, prevVal);

                    prevVal = (1.0 - pt.y / this.lastMax) * h + pointSize;
                    ctx.lineTo(pt.t, prevVal);
                }
            }

            ctx.lineTo(w, prevVal);
            ctx.lineTo(w, h + pointSize);
            ctx.closePath();
            ctx.fill();

            //Line
            prevVal = (1.0 - data[0].y / this.lastMax) * h + pointSize;

            ctx.strokeStyle = "rgb(152, 195, 121)";
            ctx.lineWidth = 2.0;
            ctx.beginPath();
            ctx.moveTo(0, prevVal);

            if(interp) {
                for(const pt of data) {
                    prevVal = (1.0 - pt.y / this.lastMax) * h + pointSize;
                    ctx.lineTo(pt.t, prevVal);
                }
            } else {
                for(let i = 1; i < data.length; i++) {
                    const pt = data[i];
                    ctx.lineTo(pt.t, prevVal);

                    prevVal = (1.0 - pt.y / this.lastMax) * h + pointSize;
                    ctx.lineTo(pt.t, prevVal);
                }
            }

            ctx.lineTo(w, prevVal);
            ctx.stroke();
        }

        //Points
        ctx.fillStyle = "rgb(152, 195, 121)";

        for(const pt of data) {
            ctx.beginPath();
            ctx.ellipse(pt.t, (1.0 - pt.y / this.lastMax) * h + pointSize, pointSize, pointSize, 0, 0, 2.0 * Math.PI);
            ctx.fill();
        }

        if(this.mousePoint !== undefined) {
            ctx.strokeStyle = "rgb(255, 255, 255)";
            ctx.fillStyle = "rgb(255, 255, 255)";

            ctx.fillRect(this.mousePoint.mouseX - 1, pointSize, 2, h);
            ctx.beginPath();
            ctx.ellipse(this.mousePoint.mouseX, this.mousePoint.mouseY, pointSize, pointSize, 0, 0, 2.0 * Math.PI);
            ctx.fill();
        }
    }

    public setDataAndAccessor(data: T[], accessor: PlotDataAccessor<T>) {
        this.data = data;
        this.accessor = accessor;
        this.render();
    }

    public onMouseMove(x: number, y: number) {
        //TODO: Replace with binary search
        const dp = DataProvider.getInstance();
        const mouseT = x / this.canvas.clientWidth;
        let found = false;
        let left;

        if(this.mousePoint === undefined) {
            left = true;
        } else if(this.mousePoint.mouseX === x) {
            left = this.mousePoint.left;
        } else {
            left = x > this.mousePoint.mouseX;
        }

        for(let i = this.data.length - 1; i >= 0; i--) {
            const pt = this.accessor(this.data[i]);
            const remappedT = dp.remapTime(pt.t);

            if(remappedT <= mouseT) {
                let computedY;

                if(this.element.classList.contains("interpolate") && i + 1 < this.data.length) {
                    const pt2 = this.accessor(this.data[i + 1]);
                    const remappedT2 = dp.remapTime(pt2.t);
                    const interpT = (mouseT - remappedT) / (remappedT2 - remappedT);
                    const interpY = (1.0 - interpT) * pt.y + interpT * pt2.y;

                    computedY = (1.0 - interpY / this.lastMax) * (this.canvas.clientHeight - 2 * pointSize) + pointSize;
                } else {
                    computedY = (1.0 - pt.y / this.lastMax) * (this.canvas.clientHeight - 2 * pointSize) + pointSize;
                }

                this.mousePoint = {
                    pid: i,
                    mouseX: x,
                    mouseY: computedY,
                    left: left
                };

                found = true;
                break;
            }
        }

        if(!found && this.data.length > 0) {
            const pt = this.accessor(this.data[0]);

            this.mousePoint = {
                pid: 0,
                mouseX: x,
                mouseY: (1.0 - pt.y / this.lastMax) * (this.canvas.clientHeight - 2 * pointSize) + pointSize,
                left: left
            };
        }

        if(this.mousePoint !== undefined) {
            const tt = TooltipManager.getInstance().displayManual();
            const d = this.data[this.mousePoint.pid];

            tt.innerHTML = `<strong>${formatTime(this.accessor(d).t)}</strong><br/>${this.label(d)}`;

            const myRect = this.element.getBoundingClientRect();
            const ttRect = tt.getBoundingClientRect();

            let ttX: number;

            if(left) {
                ttX = myRect.x + x - ttRect.width - 20;
            } else {
                ttX = myRect.x + x + 20;
            }

            const ttY = myRect.y + y - ttRect.height / 2;
            tt.style.left = ttX.toString() + "px";
            tt.style.top = ttY.toString() + "px";
        }

        this.render();
    }

    private label(data: T) {
        if(this.labeler === undefined) {
            const pt = this.accessor(data);
            return "<strong>Value: </strong>" + pt.y;
        } else {
            return this.labeler(data);
        }
    }

    public onMouseLeave() {
        if(this.mousePoint !== undefined) {
            this.mousePoint = undefined;
            this.render();
        }
    }

    public setLabeler(labeler: PlotLabeler<T> | undefined) {
        this.labeler = labeler;
    }
}
