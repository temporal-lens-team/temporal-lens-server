export abstract class EventHandler {
    private eventElement: HTMLElement;
    protected handleMouseWheel: boolean = false;
    private mouseInside: boolean = false;

    protected constructor(eventElement: HTMLElement) {
        this.eventElement = eventElement;
    }

    public onMouseDown(button: number, x: number, y: number) {}
    public onMouseMove(x: number, y: number) {}
    public onMouseUp(button: number, x: number, y: number) {}
    public onMouseWheel(x: number, y: number, dy: number) {}
    public onMouseEnter() {}
    public onMouseLeave() {}

    public getEventElement(): HTMLElement {
        return this.eventElement;
    }

    public handlesMouseWheel(): boolean {
        return this.handleMouseWheel;
    }

    public isMouseInside(): boolean {
        return this.mouseInside;
    }

    public setMouseInside(inside: boolean) {
        this.mouseInside = inside;

        if(inside) {
            this.onMouseEnter();
        } else {
            this.onMouseLeave();
        }
    }
}

let handlers: EventHandler[] = [];
let mmHandler: EventHandler | undefined = undefined;
let mmHandlerButton: number = 0;
let currentEvent: MouseEvent | undefined = undefined;

export function initEventManager() {
    document.onmousedown = (ev) => {
        currentEvent = ev;

        for(const h of handlers) {
            const r = h.getEventElement().getBoundingClientRect();
            const x = ev.clientX - r.x;
            const y = ev.clientY - r.y;

            if(x >= 0.0 && x < r.width && y >= 0.0 && y <= r.height) {
                h.onMouseDown(ev.button, x, y);

                if(mmHandler === undefined) {
                    mmHandler = h;
                    mmHandlerButton = ev.button;
                }

                ev.preventDefault();
                break;
            }
        }

        currentEvent = undefined;
    };

    document.onmouseup = (ev) => {
        currentEvent = ev;

        if(mmHandler !== undefined && mmHandlerButton === ev.button) {
            const r = mmHandler.getEventElement().getBoundingClientRect();

            mmHandler.onMouseUp(ev.button, ev.clientX - r.x, ev.clientY - r.y);
            mmHandler = undefined;

            ev.preventDefault();
        } else {
            for(const h of handlers) {
                const r = h.getEventElement().getBoundingClientRect();
                const x = ev.clientX - r.x;
                const y = ev.clientY - r.y;

                if(x >= 0.0 && x < r.width && y >= 0.0 && y <= r.height) {
                    h.onMouseUp(ev.button, x, y);
                    ev.preventDefault();
                    break;
                }
            }
        }

        currentEvent = undefined;
    };

    document.onmousemove = (ev) => {
        currentEvent = ev;

        if(mmHandler !== undefined) {
            const r = mmHandler.getEventElement().getBoundingClientRect();
            mmHandler.onMouseMove(ev.clientX - r.x, ev.clientY - r.y);
            ev.preventDefault();
        }

        for(const h of handlers) {
            const r = h.getEventElement().getBoundingClientRect();
            const x = ev.clientX - r.x;
            const y = ev.clientY - r.y;
            const inside = x >= 0.0 && x < r.width && y >= 0.0 && y <= r.height;

            if(h.isMouseInside() !== inside) {
                h.setMouseInside(inside);
            }
        }

        currentEvent = undefined;
    };

    document.onmouseleave = (ev) => {
        currentEvent = ev;

        if(mmHandler !== undefined) {
            const r = mmHandler.getEventElement().getBoundingClientRect();

            mmHandler.onMouseUp(mmHandlerButton, ev.clientX - r.x, ev.clientY - r.y);
            mmHandler = undefined;
        }

        for(const h of handlers) {
            if(h.isMouseInside()) {
                h.setMouseInside(false);
            }
        }

        currentEvent = undefined;
    };

    document.onwheel = (ev) => {
        if(ev.deltaY !== 0.0) {
            currentEvent = ev;

            for(const h of handlers) {
                if(h.handlesMouseWheel()) {
                    const r = h.getEventElement().getBoundingClientRect();
                    const x = ev.clientX - r.x;
                    const y = ev.clientY - r.y;
                    
                    if(x >= 0.0 && x < r.width && y >= 0.0 && y <= r.height) {
                        h.onMouseWheel(x, y, ev.deltaY);
                        ev.preventDefault();
                        break;
                    }
                }
            }

            currentEvent = undefined;
        }
    };
}

export function registerEventHandler(h: EventHandler) {
    handlers.push(h);
}

export function getCurrentMouseEvent(): MouseEvent | undefined {
    return currentEvent;
}
