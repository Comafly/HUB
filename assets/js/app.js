import "./tab-extensions.js";
import { Application } from "./application.js";
import { ContentBoard } from "./content-board.js";
import { ContentEditor } from "./content-editor.js";
import { MediaManager } from "./media-manager.js";
import { CollectionManager } from "./collection-manager.js";
import { Calendar } from "./calendar.js";
import { MediaViewer } from "./media-viewer.js";
import { TabController } from "./tabs.js";

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
services.application.init();
