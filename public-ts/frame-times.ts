function clamp(x: number, min: number, max: number) {
    if(x < min) {
        return min;
    } else if(x > max) {
        return max;
    } else {
        return x;
    }
}

export class FrameTimeGraph {
    private canvas: HTMLCanvasElement;
    private data: number[] = [];
    private max: number = 1.0;
    private cursorMin: number = 0.0;
    private cursorSize: number = 0.1;
    private dragOrigin: number | undefined = undefined;

    public constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.updateSize();

        //TODO: This is just for testing. Remove it.
        for(let i = 0; i < 60; i++) {
            this.data.push(Math.random());
        }

        canvas.onwheel     = (ev) => this.onMouseScroll(ev);
        canvas.onmousedown = (ev) => this.onMouseDown(ev as MouseEvent);
        canvas.onmouseup   = (ev) => this.onMouseUp(ev as MouseEvent);
        canvas.onmousemove = (ev) => this.onMouseMove(ev as MouseEvent);
    }

    public updateSize() {
        this.canvas.width = this.canvas.clientWidth;
        this.canvas.height = this.canvas.clientHeight;
    }

    public render() {
        const context = this.canvas.getContext("2d");
        const w = this.canvas.width;
        const h = this.canvas.height;

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

    private onMouseDown(ev: MouseEvent) {
        if(ev.button === 0 && this.dragOrigin === undefined) {
            const cursorX = this.cursorMin * this.canvas.width;
            this.dragOrigin = cursorX - ev.offsetX;
        }
    }

    private onMouseUp(ev: MouseEvent) {
        if(ev.button === 0) {
            this.dragOrigin = undefined;
        }
    }

    private onMouseMove(ev: MouseEvent) {
        if(this.dragOrigin !== undefined) {
            const cursorX = (this.dragOrigin + ev.offsetX) / this.canvas.width;
            this.cursorMin = clamp(cursorX, 0.0, 1.0 - this.cursorSize);
            this.render();
        }
    }

    private onMouseScroll(ev: WheelEvent) {
        let amount = ev.deltaY * 0.01;

        if(this.dragOrigin === undefined && amount != 0.0) {
            const newSize = clamp(this.cursorSize - amount, 0.01, 1.0);

            if(newSize != this.cursorSize) {
                amount = this.cursorSize - newSize;
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
    }
}
