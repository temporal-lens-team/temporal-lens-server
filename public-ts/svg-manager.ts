import { request, absoluteURL } from "./common";

const cache = new Map<string, string>();

export async function setSVG(elem: HTMLElement, url: string) {
    url = absoluteURL(url);
    
    let result;

    if(cache.has(url)) {
        result = cache.get(url);
    } else {
        try {
            result = await request(url);
        } catch(err) {
            console.error("Failed to load SVG", err)
            return;
        }

        cache.set(url, result);
    }

    elem.innerHTML = result;
}

export function loadDocumentSVGs() {
    const svgs = document.getElementsByClassName("insert-svg");

    for(const svg of svgs) {
        const elem = svg as HTMLElement;
        const path: string | undefined = elem.dataset["svg"];

        if(path === undefined) {
            console.error("Element has insert-svg class but no data-svg attribute", elem);
        } else {
            setSVG(elem, path);
        }
    }
}
