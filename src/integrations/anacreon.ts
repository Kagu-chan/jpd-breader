// @reader content-script

import { showError } from '../util.js';
import { addedObserver, parseVisibleObserver } from './common.js';

try {
    const visible = parseVisibleObserver();

    const added = addedObserver('.textline, .line_box, .sentence-entry', elements => {
        for (const element of elements) visible.observe(element);
    });

    added.observe(document.querySelector('#textlog, #entry_holder') ?? document.body, {
        subtree: true,
        childList: true,
    });
} catch (error) {
    showError(error);
}
