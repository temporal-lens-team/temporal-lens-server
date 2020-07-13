export abstract class Widget {
    protected element: HTMLDivElement;
    protected canvas: HTMLCanvasElement;

    protected constructor(div: HTMLDivElement, captureWheel: boolean = false) {
        const canvas = document.createElement("canvas");
        const loadingDiv = document.createElement("div");
        const loadingSpan = document.createElement("span");

        loadingSpan.innerText = "Loading...";
        loadingDiv.append(loadingSpan);
        
        div.appendChild(canvas);
        div.append(loadingDiv);

        this.element = div;
        this.canvas = canvas;
        this.updateSize();

        canvas.onmousedown  = (ev) => this.onMouseDown(ev.button, ev.offsetX, ev.offsetY);
        canvas.onmousemove  = (ev) => this.onMouseMove(ev.offsetX, ev.offsetY);
        canvas.onmouseup    = (ev) => this.onMouseUp(ev.button, ev.offsetX, ev.offsetY);
        canvas.onmouseleave = (ev) => this.onMouseLeave();

        if(captureWheel) {
            canvas.onwheel = (ev) => {
                if(ev.deltaY != 0.0) {
                    this.onMouseWheel(ev.offsetX, ev.offsetY, ev.deltaY);
                    ev.preventDefault();
                }
            };
        }
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
    protected onMouseWheel(x: number, y: number, dy: number) {}
    protected onMouseLeave() {}
    protected abstract renderInternal(context: CanvasRenderingContext2D, w: number, h: number);

    public setLoading(loading: boolean) {
        if(loading) {
            this.element.classList.add("loading");
        } else {
            this.element.classList.remove("loading");
        }
    }
}
