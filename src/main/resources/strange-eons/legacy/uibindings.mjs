// Bindings between controls and component settings, adapted from Strange
// Eons' uibindings.js.
import { Java, facade } from "../internal/host.mjs";
import { Settings, sprintf } from "./common.mjs";

const pkg = "ca.cgjennings.apps.arkham";
const AWTComponent = Java.type("java.awt.Component");
const ButtonGroup = Java.type("javax.swing.ButtonGroup");
const GameComponent = Java.type(`${pkg}.component.GameComponent`);
const HostClasses = Java.type("org.strangeeons.graaljs.HostClasses");
const JScrollPane = Java.type("javax.swing.JScrollPane");
const TintableBinding = Java.type(`${pkg}.plugins.UILibraryHelper$TintableBinding`);

export const SettingBackedControl = facade(`${pkg}.diy.SettingBackedControl`, {});

export function Binding(name, uiControl, gameComponent, sheetsToUpdate) {
    if (!name) {
        throw new Error("missing bind name");
    }
    if (!uiControl) {
        throw new Error("missing uiControl");
    }
    if (!gameComponent) {
        throw new Error("missing gameComponent");
    }
    if (!(uiControl instanceof AWTComponent) && !(uiControl instanceof ButtonGroup)) {
        throw new Error("uiControl must be a Component or ButtonGroup");
    }
    if (!(gameComponent instanceof GameComponent)) {
        throw new Error("gameComponent must be a GameComponent");
    }
    if (name.startsWith("$")) {
        name = name.substring(1).replace("_", "-");
    }

    const sheets = gameComponent.getSheets();
    if (sheetsToUpdate === undefined) {
        this.sheetBits = -1;
    } else {
        this.sheetBits = 0;
        for (const sheet of sheetsToUpdate) {
            if (sheet > 31) {
                throw new Error("illegal sheet number: " + sheet);
            }
            if (sheets != null && sheet >= sheets.length) {
                throw new Error("sheet does not exist: " + sheet);
            }
            this.sheetBits |= 1 << sheet;
        }
    }

    this.isActive = false;
    this.name = name;
    this.settings = gameComponent.getSettings();
    this.component = gameComponent;
    this.control = uiControl;

    if (this.settings.get(name) != null) {
        this.initComponent();
    }
}

Binding.prototype._controlValue = function _controlValue() {
    return this.control instanceof SettingBackedControl
            ? this.control.toSetting()
            : this.controlToSetting(this.control);
};

Binding.prototype.update = function update() {
    const newValue = this._controlValue();
    if (newValue == null || newValue === this.settings.get(this.name)) {
        return false;
    }
    this.settings.set(this.name, newValue);
    const sheets = this.component.getSheets();
    if (sheets) {
        let mask = this.sheetBits;
        for (let i = 0; i < sheets.length; ++i, mask >>= 1) {
            if ((mask & 1) === 1) {
                this.component.markChanged(i);
            }
        }
    }
    return true;
};

Binding.prototype.initComponent = function initComponent() {
    const value = this.settings.get(this.name);
    if (this.control instanceof SettingBackedControl) {
        this.control.fromSetting(value);
    } else {
        this.settingToControl(value, this.control);
    }

    // Persist the control's value when the setting is absent, so that the
    // first heartbeat does not mark a just-opened component as changed.
    if (this.settings.get(this.name) == null) {
        const defaultValue = this._controlValue();
        if (defaultValue != null) {
            this.settings.set(this.name, defaultValue);
        }
    }
};

Binding.prototype.controlToSetting = function controlToSetting(control) {
    if (control.getText === undefined) {
        throw new Error("you must provide a binding class for this control: " + this.name);
    }
    return control.getText();
};

Binding.prototype.settingToControl = function settingToControl(value, uiControl) {
    if (uiControl.setText === undefined) {
        throw new Error("you must provide a binding class for this control: " + this.name);
    }
    uiControl.setText(value);
    uiControl.select(0, 0);
};

Binding.prototype.toString = function toString() {
    const sheets = [];
    let mask = this.sheetBits;
    for (let i = 0; i < 31; ++i, mask >>= 1) {
        if ((mask & 1) === 1) {
            sheets.push(i);
        }
    }
    return `Binding "${this.name}": [${HostClasses.simpleName(this.control)} -> `
            + `${HostClasses.simpleName(this.component)}], sheets: [${sheets.join(", ")}]`;
};

export function ActiveBinding(name, uiControl, gameComponent, sheetsToUpdate) {
    Binding.call(this, name, uiControl, gameComponent, sheetsToUpdate);
    this.isActive = true;
    this.installActivationHandler();
}
ActiveBinding.subclass(Binding);

ActiveBinding.prototype.installActivationHandler = function installActivationHandler() {
    if (this.control.addActionListener === undefined) {
        throw new Error("this control does not support an ActionListener: you must create "
                + "a custom ActiveBinding subclass or use a Binding instead");
    }
    this.control.addActionListener(() => this.update());
};

export function Bindings(editor, gameComponent) {
    this.bindings = [];
    this.activeBindings = [];
    this.editor = editor;
    this.component = gameComponent || editor.getGameComponent();
    this.alreadyBound = false;
}

const bindingClasses = new Map();

Bindings.prototype.add = function add(name, control, sheets, bindClass) {
    const target = control instanceof JScrollPane ? control.getViewport().getView() : control;
    const type = bindClass ?? Bindings.getBindingClass(target);
    if (type == null) {
        throw new Error("no binding class is registered for " + HostClasses.name(target));
    }
    const binding = new type(name, target, this.component, sheets);
    (binding.isActive ? this.activeBindings : this.bindings).push(binding);
};

Bindings.prototype.addAll = function addAll(...argumentLists) {
    for (const args of argumentLists) {
        this.add(...args);
    }
};

Bindings.prototype.createUpdateFunction = function createUpdateFunction() {
    const bindings = this.bindings;
    return function updateFunction() {
        let changed = false;
        for (const binding of bindings) {
            try {
                changed = binding.update() || changed;
            } catch (ex) {
                Error.handleUncaught(ex);
            }
        }
        return changed;
    };
};

Bindings.prototype.createPopulateFunction = function createPopulateFunction() {
    const { bindings, activeBindings } = this;
    return function populateFunction() {
        try {
            for (const binding of bindings) {
                binding.initComponent();
            }
            for (const binding of activeBindings) {
                binding.initComponent();
            }
        } catch (ex) {
            Error.handleUncaught(ex);
        }
    };
};

Bindings.prototype.bind = function bind() {
    if (this.alreadyBound) {
        throw new Error("already bound: " + this);
    }
    this.alreadyBound = true;
    this.editor.addFieldPopulationListener(this.createPopulateFunction());
    this.editor.addHeartbeatListener(this.createUpdateFunction());
};

Bindings.prototype.toString = function toString() {
    const line = (binding, i) => (binding == null
            ? sprintf("%03d  [null]\n", i)
            : sprintf("%03d  %s\n", i, binding.toString()));
    return [this.bindings, this.activeBindings].map((list) => list.map(line).join("")).join("");
};

Bindings.getBindingClass = function getBindingClass(control) {
    for (const name of HostClasses.hierarchy(control)) {
        const binding = bindingClasses.get(name);
        if (binding) {
            return binding;
        }
    }
    return null;
};

Bindings.registerBindingClass = function registerBindingClass(componentClass, bindingClass) {
    const name = Java.isType(componentClass) ? HostClasses.name(componentClass.class) : String(componentClass);
    bindingClasses.set(name, bindingClass);
};

export function CheckBoxBinding(name, uiControl, gameComponent, sheetsToUpdate) {
    Binding.call(this, name, uiControl, gameComponent, sheetsToUpdate);
}
CheckBoxBinding.subclass(ActiveBinding);

CheckBoxBinding.prototype.controlToSetting = function controlToSetting(control) {
    return control.isSelected() ? "1" : "0";
};

CheckBoxBinding.prototype.settingToControl = function settingToControl(value, control) {
    control.setSelected(Settings.yesNo(value));
};

export function ListBinding(name, uiControl, gameComponent, sheetsToUpdate) {
    ActiveBinding.call(this, name, uiControl, gameComponent, sheetsToUpdate);
}
ListBinding.subclass(ActiveBinding);

ListBinding.prototype.installActivationHandler = function installActivationHandler() {
    this.control.addListSelectionListener(() => this.update());
};

ListBinding.prototype.controlToSetting = function controlToSetting(control) {
    const selected = control.getSelectedValue();
    return selected == null ? null : String(selected);
};

ListBinding.prototype.settingToControl = function settingToControl(value, control) {
    const model = control.getModel();
    for (let i = 0; i < model.getSize(); ++i) {
        if (String(model.getElementAt(i)) === value) {
            control.setSelectedIndex(i);
            return;
        }
    }
};

export function ComboBoxBinding(name, uiControl, gameComponent, sheetsToUpdate) {
    ActiveBinding.call(this, name, uiControl, gameComponent, sheetsToUpdate);
}
ComboBoxBinding.subclass(ActiveBinding);

ComboBoxBinding.prototype.controlToSetting = function controlToSetting(control) {
    const selected = control.getSelectedItem();
    return selected == null ? null : String(selected);
};

ComboBoxBinding.prototype.settingToControl = function settingToControl(value, control) {
    if (control.isEditable()) {
        control.setSelectedItem(value);
        return;
    }
    const model = control.getModel();
    for (let i = 0; i < model.getSize(); ++i) {
        if (String(model.getElementAt(i)) === value) {
            control.setSelectedIndex(i);
            return;
        }
    }
};

export function IndexedComboBoxBinding(name, uiControl, gameComponent, sheetsToUpdate) {
    ActiveBinding.call(this, name, uiControl, gameComponent, sheetsToUpdate);
}
IndexedComboBoxBinding.subclass(ActiveBinding);

IndexedComboBoxBinding.prototype.controlToSetting = function controlToSetting(control) {
    const selected = control.getSelectedIndex();
    return selected < 0 ? null : String(selected);
};

IndexedComboBoxBinding.prototype.settingToControl = function settingToControl(value, control) {
    if (control.isEditable()) {
        throw new Error("IndexedComboBoxBinding cannot be used with editable combo boxes");
    }
    control.setSelectedIndex(parseInt(value, 10));
};

export function SpinnerBinding(name, uiControl, gameComponent, sheetsToUpdate) {
    ActiveBinding.call(this, name, uiControl, gameComponent, sheetsToUpdate);
}
SpinnerBinding.subclass(ActiveBinding);

SpinnerBinding.prototype.installActivationHandler = function installActivationHandler() {
    this.control.addChangeListener(() => this.update());
};

SpinnerBinding.prototype.controlToSetting = function controlToSetting(control) {
    return String(Math.trunc(control.getValue()));
};

SpinnerBinding.prototype.settingToControl = function settingToControl(value, control) {
    control.setValue(parseInt(value, 10));
};

export function SliderBinding(name, uiControl, gameComponent, sheetsToUpdate) {
    ActiveBinding.call(this, name, uiControl, gameComponent, sheetsToUpdate);
}
SliderBinding.subclass(SpinnerBinding);

export function HSBPanelBinding(name, uiControl, gameComponent, sheetsToUpdate) {
    ActiveBinding.call(this, name, uiControl, gameComponent, sheetsToUpdate);
    this.helper = new TintableBinding(() => {
        try {
            this.update();
        } catch (ex) {
            Error.handleUncaught(ex);
        }
    });
    this.settingToControl(gameComponent.getSettings().get(this.name), uiControl);
    uiControl.setTintable(this.helper, false);
}
HSBPanelBinding.subclass(ActiveBinding);

HSBPanelBinding.prototype.installActivationHandler = function installActivationHandler() {
};

HSBPanelBinding.prototype.controlToSetting = function controlToSetting(control) {
    return control.toString();
};

HSBPanelBinding.prototype.settingToControl = function settingToControl(value, control) {
    control.setHSB(Settings.tint(value));
};

export function ButtonGroupBinding(name, uiControl, gameComponent, sheetsToUpdate) {
    ActiveBinding.call(this, name, uiControl, gameComponent, sheetsToUpdate);
}
ButtonGroupBinding.subclass(ActiveBinding);

ButtonGroupBinding.prototype.controlToSetting = function controlToSetting(control) {
    return control.toSetting();
};

ButtonGroupBinding.prototype.settingToControl = function settingToControl(value, control) {
    control.fromSetting(value);
};

Bindings.registerBindingClass("javax.swing.text.JTextComponent", Binding);
Bindings.registerBindingClass(`${pkg}.plugins.UILibraryHelper$CodeArea`, Binding);
Bindings.registerBindingClass("javax.swing.JCheckBox", CheckBoxBinding);
Bindings.registerBindingClass("javax.swing.JToggleButton", CheckBoxBinding);
// A cycle button is setting-backed; this binding only attaches its listener.
Bindings.registerBindingClass("ca.cgjennings.ui.JCycleButton", CheckBoxBinding);
Bindings.registerBindingClass("javax.swing.JList", ListBinding);
Bindings.registerBindingClass("javax.swing.JComboBox", ComboBoxBinding);
Bindings.registerBindingClass("javax.swing.JSpinner", SpinnerBinding);
Bindings.registerBindingClass("javax.swing.JSlider", SliderBinding);
Bindings.registerBindingClass(`${pkg}.HSBPanel`, HSBPanelBinding);
Bindings.registerBindingClass(`${pkg}.plugins.UILibraryHelper$BindableGroup`, ButtonGroupBinding);
