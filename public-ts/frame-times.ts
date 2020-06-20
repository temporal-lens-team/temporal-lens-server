import { Widget } from "./widget";

function clamp(x: number, min: number, max: number) {
    if(x < min) {
        return min;
    } else if(x > max) {
        return max;
    } else {
        return x;
    }
}

export class FrameTimeGraph extends Widget {
    private data: number[] = [];
    private max: number = 1.0;
    private cursorMin: number = 0.0;
    private cursorSize: number = 0.1;
    private dragOrigin: number | undefined = undefined;

    public constructor(canvas: HTMLCanvasElement) {
        super(canvas);

        //TODO: This is just for testing. Remove it.
        for(let i = 0; i < 60; i++) {
            this.data.push(Math.random());
        }
    }

    public renderInternal(context: CanvasRenderingContext2D, w: number, h: number) {
        const barW = Math.min(20.0, w / this.data.length);
        const spacing = (w - this.data.length * barW) / (this.data.length + 1);

        let x = spacing;
        context.clearRect(0.0, 0.0, w, h);
        context.strokeStyle = "none";
        context.fillStyle = "#0080ff";

        for(const val of this.data) {            
            const barH = val * h / this.max;
            context.fillRect(x, h - barH, barW, barH);

            x += barW + spacing;
        }

        context.lineWidth = 1.0;
        context.strokeStyle = "#808080";
        context.fillStyle = "rgba(128, 128, 128, 0.5)";
        context.fillRect(this.cursorMin * w, 0.0, this.cursorSize * w, h);
        context.strokeRect(this.cursorMin * w + 0.5, 0.5, this.cursorSize * w - 1.0, h - 1.0);
    }

    protected onMouseDown(button: number, x: number, y: number) {
        if(button === 0 && this.dragOrigin === undefined) {
            const cursorX = this.cursorMin * this.canvas.width;
            this.dragOrigin = cursorX - x;
        }
    }

    protected onMouseUp(button: number, x: number, y: number) {
        if(button === 0) {
            this.dragOrigin = undefined;
        }
    }

    protected onMouseMove(x: number, y: number) {
        if(this.dragOrigin !== undefined) {
            const cursorX = (this.dragOrigin + x) / this.canvas.width;
            this.cursorMin = clamp(cursorX, 0.0, 1.0 - this.cursorSize);
            this.render();
        }
    }

    protected onMouseWheel(deltaY: number) {
        const newSize = clamp(this.cursorSize - Math.sign(deltaY) * 0.01, 0.01, 1.0);

        if(newSize != this.cursorSize) {
            const amount = this.cursorSize - newSize;
            this.cursorSize = newSize;

            const end = this.cursorMin + this.cursorSize;

            if(end > 1.0) {
                this.cursorMin -= end - 1.0;
            } else {
                this.cursorMin = Math.max(this.cursorMin + amount * 0.5, 0.0);
            }

            this.render();
        }
    }

    protected onMouseLeave() {
        this.dragOrigin = undefined;
    }
}
