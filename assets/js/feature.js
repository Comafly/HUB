/** Shared dependency wiring; bind callbacks once so DOM listeners retain their owner. */
export class Feature {
  constructor(services) {
    this.services = services;
    for (const name of Object.getOwnPropertyNames(
      Object.getPrototypeOf(this),
    )) {
      if (name !== "constructor" && typeof this[name] === "function")
        this[name] = this[name].bind(this);
    }
  }
}
