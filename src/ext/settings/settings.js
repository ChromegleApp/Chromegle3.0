let ConstantValues = {
    websiteURL: "https://chromegle.net",
    discordURL: "https://chromegle.net/discord",
    githubURL: "https://chromegle.net/github",
    apiURL: "https://m52o1m3c29.execute-api.eu-central-1.amazonaws.com/",
    _helpfulTips: ["We hope you enjoy our extension as much as we enjoyed making it!"],
    getHelpfulTip: () => {
        return ConstantValues._helpfulTips[[Math.floor(Math.random() * ConstantValues._helpfulTips.length)]]
            .replaceAll("%discord%", ConstantValues.discordURL)
            .replaceAll("%website%", ConstantValues.websiteURL)
            .replaceAll("%github%", ConstantValues.githubURL);
    },
    videoPopoutStylesheet: ""
}

class SettingsManager extends Module {
    #menu = new SettingsMenu();
    

    constructor() {
        super();
        Settings = this;


        console.log("Setting MENAUUUUUU")
        // Assign button function
        $(ButtonFactory.menuButton).on("click", () => {
            this.#menu.enable();
        })

    }

    enable() {
        this.#menu.enable();
    }

    disable() {
        this.#menu.disable();
    }

}

document.addEventListener("storageSettingsUpdate", (event) => {
    Logger.INFO("Updated sync-storage configuration option on <%s> event: %s", event.type, JSON.stringify(event.detail))
});

class MutableField {
    static localValues;

    #storageName;
    #default;
    #type;
    #warning;

    constructor(config) {
        this.#storageName = config["storageName"]
        this.#default = config["default"] != null ? config["default"] : null;
        this.#type = config["type"];
        this.#warning = config["warning"];
    }

    fromSettingsUpdateEvent(event) {
        return event.detail[this.getName()];
    }

    async retrieveValue(storageArea = "sync", useDefault = true) {
        let query = {[this.getName()]: useDefault ? this.getDefault() : null};
        return ((await chrome.storage[storageArea].get(query)) || {})[this.getName()];
    }

    updateValue(config) {
        if (!config["confirm"] || config["confirm"] === "false" || config["confirm"] === false) return false;
        const override = {}

        if (this.#warning != null) {

            if (this.#warning["state"] == null || this.#warning["state"] === config["value"]) {
                let result = confirm(this.#warning["message"] || null);

                // Cancel
                if (!result) {
                    this.update(true);
                    return false;
                }

            }

        }

        override[this.#storageName] = config["value"]
        chrome.storage.sync.set(override);
        document.dispatchEvent(new CustomEvent("storageSettingsUpdate", {detail: override}));
        return true;
    }

    update(noChange) {
        return null;
    }

    getType() {
        return this.#type;
    }

    getDefault() {
        return this.#default;

    }

    getName() {
        return this.#storageName
    }


}


class SwitchEdit extends MutableField {
    #elementName;
    #otherElementNames;
    #value;

    getValue() {
        return this.#value;
    }

    constructor(config) {
        config["type"] = "switch";
        super(config)
        this.#value = config["value"];
        this.#elementName = config["elementName"];
        this.#otherElementNames = config["otherElementNames"];
    }

    getElementName() {
        return this.#elementName;
    }

    update(noChange = false) {
        let currentQuery = {}
        currentQuery[this.getName()] = this.getDefault();

        chrome.storage.sync.get(currentQuery, (result) => {
            const currentlySelected = result[this.getName()] === this.#elementName;

            // No Change Requested
            if (noChange) {

                // Is currently Selected, change to display selection
                if (currentlySelected) {
                    document.dispatchEvent(new CustomEvent("SwitchModify", {
                        detail: {
                            "element": this.#elementName,
                            "others": this.#otherElementNames,
                            "change": false
                        }
                    }));
                }

                // Is not selected, don't display
                return;
            }

            // Not currently Selected
            if (!currentlySelected && !noChange) {
                let result = this.updateValue({"confirm": "true", "value": this.#elementName});

                if (result) {
                    document.dispatchEvent(new CustomEvent("SwitchModify", {
                        detail: {
                            "element": this.#elementName,
                            "others": this.#otherElementNames,
                            "change": true
                        }
                    }));
                }
            }


        });

    }

}


class ToggleEdit extends MutableField {
    #elementName;

    constructor(config) {
        config["type"] = "toggle";
        super(config)
        this.#elementName = config["elementName"];
    }

    getElementName() {
        return this.#elementName;
    }

    update(noChange = false) {
        const name = this.getName();
        const request = {}
        let newResult;
        request[name] = this.getDefault();
        chrome.storage.sync.get(request, (result) => {
            if (noChange) {
                newResult = result[name];

                document.dispatchEvent(new CustomEvent("ToggleModify", {
                    detail: {
                        "element": this.#elementName,
                        "value": newResult,
                        "change": !noChange
                    }
                }));

            } else {
                newResult = result[name] === "true" ? "false" : "true";
                let storageResult = this.updateValue({"confirm": "true", "value": newResult});

                if (storageResult) {

                    document.dispatchEvent(new CustomEvent("ToggleModify", {
                        detail: {
                            "element": this.#elementName,
                            "value": newResult,
                            "change": !noChange
                        }
                    }));
                }
            }

        });
    }

}

class FieldEdit extends MutableField {
    #prompt;
    #check;
    #defaultCheck = () => true;

    getPrompt() {
        return this.#prompt;
    }

    constructor(config) {
        config["type"] = "field";
        super(config);
        this.#prompt = config["prompt"];
        this.#check = config["check"] || this.#defaultCheck;
    }

    getResponse(previous) {
        return prompt(this.#prompt, previous);
    }

    update(noChange) {
        if (noChange) return;

        const name = this.getName();
        const request = {}
        request[name] = this.getDefault();
        chrome.storage.sync.get(request, (result) => {
            const response = this.getResponse(result[name]);
            this.updateValue(this.#check(response));
        })
    }

}

class MultiFieldEdit extends FieldEdit {
    #times;

    constructor(config) {
        super(config);
        this.#times = config["times"] || 1;
    }

    static #suffixCalculation(i) {
        let j = i % 10, k = i % 100;
        if (j === 1 && k !== 11) return i + "st";
        if (j === 2 && k !== 12) return i + "nd";
        if (j === 3 && k !== 13) return i + "rd";
        return i + "th";
    }

    setTimes(_times) {
        this.#times = _times;
    }

    getResponse(previous) {
        let results = [];
        let defaults = this.getDefault();

        for (let i = 0; i < this.#times; i++) {
            results.push(prompt(this.getPrompt().replaceAll("%n", MultiFieldEdit.#suffixCalculation(i + 1)), previous[i] || defaults[i] || ""))
        }

        return results;
    }
}

class MutableMultiEditField extends MultiFieldEdit {
    #max;
    #min;
    #defaultTimes = "1";

    constructor(config) {
        super(config);
        this.#max = config["max"] || null;
        this.#min = (config["min"] != null && config["min"] >= 1) ? config["min"] : 0;
    }

    getTimes() {

        let response = prompt(`How many inputs would you like to enter? (Max: ${this.#max} | Min: ${this.#min})`, this.#defaultTimes);

        if (!isNumeric(response)) return this.#min;
        else if (response > this.#max) return this.#max;
        else if (response < this.#min) return this.#min;
        else return response;

    }

    getResponse(_previous) {
        this.setTimes(this.getTimes())
        // noinspection JSValidateTypes
        return super.getResponse(_previous);
    }

}

class ExternalField extends MutableField {
    #externalFunction

    constructor(config) {
        config["type"] = "external";
        super(config);
        this.#externalFunction = config["external"];
    }

    update(noChange) {
        if (noChange) return;
        this.#externalFunction();
    }
}
