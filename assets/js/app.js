import "./tab-extensions.js?v=20261006-inline-links-steppers";
import { Application } from "./application.js?v=20261006-inline-links-steppers";
import { ContentBoard } from "./content-board.js?v=20261006-inline-links-steppers";
import { ContentEditor } from "./content-editor.js?v=20261006-inline-links-steppers";
import { MediaManager } from "./media-manager.js?v=20261006-inline-links-steppers";
import { CollectionManager } from "./collection-manager.js?v=20261006-inline-links-steppers";
import { Calendar } from "./calendar.js?v=20261006-inline-links-steppers";
import { MediaViewer } from "./media-viewer.js?v=20261006-inline-links-steppers";
import { Watchlist } from "./watchlist.js?v=20261006-inline-links-steppers";
import { TabController } from "./tabs.js?v=20261006-inline-links-steppers";

// Construct features before starting; dependencies are explicit and share one state.
const services = {};
services.application = new Application(services);
services.board = new ContentBoard(services);
services.editor = new ContentEditor(services);
services.media = new MediaManager(services);
services.collections = new CollectionManager(services);
services.calendar = new Calendar(services);
services.viewer = new MediaViewer(services);
services.tabs = new TabController(services);
services.watchlist = new Watchlist(services);
// Measure sticky controls only after the document and stylesheet have loaded.
if (document.readyState === "complete") services.application.init();
else window.addEventListener("load", () => services.application.init(), { once: true });
