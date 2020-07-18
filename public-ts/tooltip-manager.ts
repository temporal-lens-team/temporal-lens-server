export interface TooltipItem {
    (): string;
}

export class TooltipRect {
    public x: number;
    public y: number;
    public w: number;
    public h: number;

    public constructor(elem: HTMLElement, x: number, y: number, w: number, h: number) {
        const eRect = elem.getBoundingClientRect();

        this.x = eRect.x + x;
        this.y = eRect.y + y;
        this.w = w;
        this.h = h;
    }
}

export class TooltipManager {
    private static instance: TooltipManager | undefined = undefined;
    private element: HTMLDivElement;
    private timeout: number | undefined = undefined;
    private rect: TooltipRect | undefined = undefined;
    private newRect: TooltipRect | undefined = undefined;
    private newItem: TooltipItem | undefined = undefined;
    private visible: boolean = false;
    private lastMouseX: number = 0;
    private lastMouseY: number = 0;

    private constructor() {
        this.element = document.getElementById("tooltip") as HTMLDivElement;
    }

    public static getInstance() {
        if(this.instance === undefined) {
            this.instance = new TooltipManager();
        }

        return this.instance;
    }

    public beginMove(x: number, y: number) {
        if(this.visible) {
            if(x < this.rect.x || x > this.rect.x + this.rect.w || y < this.rect.y || y > this.rect.y + this.rect.h) {
                this.element.classList.remove("visible");
                this.visible = false;
            } else {
                this.element.style.left = (x + 20).toString() + "px";
                this.element.style.top = (y + 20).toString() + "px";
            }
        }

        this.newItem = undefined;
        this.newRect = undefined;
        this.lastMouseX = x;
        this.lastMouseY = y;
    }

    public endMove() {
        if(!this.visible) {
            if(this.timeout !== undefined) {
                clearTimeout(this.timeout);
                this.timeout = undefined;
            }

            if(this.newItem !== undefined && this.newRect !== undefined) {
                this.timeout = setTimeout(() => this.timedOut(), 1000);
            }
        }
    }

    private timedOut() {
        this.element.innerHTML = this.newItem();
        this.element.classList.add("visible");
        this.element.style.left = (this.lastMouseX + 20).toString() + "px";
        this.element.style.top = (this.lastMouseY + 20).toString() + "px";

        this.visible = true;
        this.rect    = this.newRect;
        this.newRect = undefined;
        this.newItem = undefined;
        this.timeout = undefined;
    }

    public displayTooltip(rect: TooltipRect, item: TooltipItem) {
        this.newRect = rect;
        this.newItem = item;
    }
}
