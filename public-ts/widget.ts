export abstract class Widget {
    protected canvas: HTMLCanvasElement;

    protected constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.updateSize();

        canvas.onmousedown  = (ev) => this.onMouseDown(ev.button, ev.offsetX, ev.offsetY);
        canvas.onmousemove  = (ev) => this.onMouseMove(ev.offsetX, ev.offsetY);
        canvas.onmouseup    = (ev) => this.onMouseUp(ev.button, ev.offsetX, ev.offsetY);
        canvas.onmouseleave = (ev) => this.onMouseLeave();

        canvas.onwheel = (ev) => {
            if(ev.deltaY != 0.0) {
                this.onMouseWheel(ev.deltaY);
            }
        };
    }

    public updateSize() {
        this.canvas.width = this.canvas.clientWidth;
        this.canvas.height = this.canvas.clientHeight;
    }

    public render() {
        const context = this.canvas.getContext("2d");
        this.renderInternal(context, this.canvas.width, this.canvas.height);
    }

    protected onMouseDown(button: number, x: number, y: number) {}
    protected onMouseMove(x: number, y: number) {}
    protected onMouseUp(button: number, x: number, y: number) {}
    protected onMouseWheel(dy: number) {}
    protected onMouseLeave() {}
    protected abstract renderInternal(context: CanvasRenderingContext2D, w: number, h: number);
}
