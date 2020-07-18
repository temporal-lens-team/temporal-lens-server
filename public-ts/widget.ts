import { EventHandler, registerEventHandler } from "./event-manager";

export abstract class Widget extends EventHandler {
    protected element: HTMLDivElement;
    protected canvas: HTMLCanvasElement;

    protected constructor(div: HTMLDivElement) {
        const canvas = document.createElement("canvas");
        const loadingDiv = document.createElement("div");
        const loadingSpan = document.createElement("span");

        loadingSpan.innerText = "Loading...";
        loadingDiv.append(loadingSpan);
        
        div.appendChild(canvas);
        div.appendChild(loadingDiv);

        super(canvas);
        this.element = div;
        this.canvas = canvas;
        this.updateSize();

        registerEventHandler(this);
    }

    public updateSize() {
        this.canvas.width = this.canvas.clientWidth;
        this.canvas.height = this.canvas.clientHeight;
    }

    public render() {
        const context = this.canvas.getContext("2d");
        this.renderInternal(context, this.canvas.width, this.canvas.height);
    }

    protected abstract renderInternal(context: CanvasRenderingContext2D, w: number, h: number);

    public setLoading(loading: boolean) {
        if(loading) {
            this.element.classList.add("loading");
        } else {
            this.element.classList.remove("loading");
        }
    }
}
