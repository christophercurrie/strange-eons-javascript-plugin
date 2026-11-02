// Simple panel layout, adapted from Strange Eons' uilayout.js.
import { Java } from "../internal/host.mjs";
import { assertDispatchThread, Eons, string } from "./common.mjs";

const AWTComponent = Java.type("java.awt.Component");
const AWTImage = Java.type("java.awt.Image");
const BorderFactory = Java.type("javax.swing.BorderFactory");
const BorderLayout = Java.type("java.awt.BorderLayout");
const CompoundBorder = Java.type("javax.swing.border.CompoundBorder");
const FlowLayout = Java.type("java.awt.FlowLayout");
const GridBagConstraints = Java.type("java.awt.GridBagConstraints");
const GridBagLayout = Java.type("java.awt.GridBagLayout");
const ImageIcon = Java.type("javax.swing.ImageIcon");
const Insets = Java.type("java.awt.Insets");
const JComponent = Java.type("javax.swing.JComponent");
const JLabel = Java.type("javax.swing.JLabel");
const JPanel = Java.type("javax.swing.JPanel");
const JScrollPane = Java.type("javax.swing.JScrollPane");
const JSplitPane = Java.type("javax.swing.JSplitPane");
const JTabbedPane = Java.type("javax.swing.JTabbedPane");
const JTextArea = Java.type("javax.swing.JTextArea");
const JTextField = Java.type("javax.swing.JTextField");
const MigLayout = Java.type("net.miginfocom.swing.MigLayout");
const RiverLayout = Java.type("se.datadosen.component.RiverLayout");
const ScrollPaneConstants = Java.type("javax.swing.ScrollPaneConstants");
const TitledBorder = Java.type("javax.swing.border.TitledBorder");
const UILibraryDialogTemplate = Java.type("ca.cgjennings.apps.arkham.plugins.UILibraryDialogTemplate");
const UILibraryHelper = Java.type("ca.cgjennings.apps.arkham.plugins.UILibraryHelper");

export function AbstractContainer(controls) {
    this.controls = [];
    this.hints = [];

    // When true, _controlToComponent gives text controls whose columns or
    // rows are 0 a default size; simple containers like Row and Stack set it.
    this._growTextControls = false;

    if (controls && controls.length > 0) {
        for (const control of controls) {
            this.add(control);
        }
    }

    let realized = false;

    this._checkRealized = function () {
        assertDispatchThread();
        if (realized) {
            throw new Error("this container has already been realized");
        }
        realized = true;
    };

    Object.defineProperty(this, "realized", { get: () => realized });

    this.title = undefined;
    this.editorTabWrapping = true;
    this.editorTabScrolling = false;

    this.isRealized = () => realized;
    this.setTitle = function setTitle(text) {
        this.title = text;
    };
    this.getTitle = function getTitle() {
        return this.title;
    };
}

AbstractContainer.prototype._controlsToArray = function _controlsToArray(source) {
    const components = (source || this.controls).map((control) => this._controlToComponent(control));
    return Java.to(components, "java.lang.Object[]");
};

AbstractContainer.prototype._controlToComponent = function _controlToComponent(control) {
    if (control.realize !== undefined) {
        return control.realize();
    }
    if (control instanceof AWTComponent) {
        if (this._growTextControls) {
            if (control instanceof JTextField || control instanceof JTextArea) {
                control.setColumns(Math.max(control.getText().length, 16));
            }
            if (control instanceof JTextArea && control.getRows() === 0) {
                control.setRows(5);
            }
        }
        return control;
    }
    if (control instanceof AWTImage) {
        return new JLabel(new ImageIcon(control));
    }
    return new JLabel(String(control));
};

AbstractContainer.prototype._applyTitle = function _applyTitle(panel) {
    if (this.title !== undefined) {
        const titleBorder = new TitledBorder(null, this.title === null ? null : this.title.toString());
        const border = panel.getBorder();
        panel.setBorder(border == null ? titleBorder : new CompoundBorder(titleBorder, border));
    }
    return panel;
};

AbstractContainer.prototype.realize = Function.abstractMethod;

AbstractContainer.prototype.add = function add(...controls) {
    controls.forEach((control, i) => {
        if (control == null) {
            throw new Error("missing control at index " + i);
        }
        this.controls.push(control);
        this.hints.push(null);
    });
    return this;
};

AbstractContainer.prototype.place = function place(...pairs) {
    if (pairs.length % 2 !== 0) {
        throw new Error("arguments to place must be pairs: control1, hint1, control2, hint2, ...");
    }
    for (let i = 0; i < pairs.length; i += 2) {
        if (pairs[i] == null) {
            throw new Error("missing control at index " + i);
        }
        this.controls.push(pairs[i]);
        this.hints.push(pairs[i + 1]);
    }
    return this;
};

AbstractContainer.prototype._checkIndex = function _checkIndex(index) {
    if (index < 0 || index >= this.controls.length) {
        throw new Error("invalid control index: " + index);
    }
};

AbstractContainer.prototype.getControl = function getControl(index) {
    this._checkIndex(index);
    return this.controls[index];
};

AbstractContainer.prototype.getHint = function getHint(index) {
    this._checkIndex(index);
    return this.hints[index];
};

AbstractContainer.prototype.getControlCount = function getControlCount() {
    return this.controls.length;
};

AbstractContainer.prototype.addToEditor = function addToEditor(editor, title, heartbeatListener, fieldPopulationListener, tabIndex) {
    if (!editor) {
        throw new Error("missing editor");
    }
    const tabTitle = title || string("plug-user");
    const tabPane = AbstractContainer.findEditorTabPane(editor);
    if (tabPane == null) {
        throw new Error("not a compatible game component type");
    }

    const panel = this.realize();
    const padding = BorderFactory.createEmptyBorder(8, 8, 8, 8);
    const border = panel.getBorder();
    panel.setBorder(border == null ? padding : new CompoundBorder(padding, border));

    let panelShell = panel;
    if (this.editorTabWrapping) {
        panelShell = new JPanel(new BorderLayout());
        panelShell.add(panel, BorderLayout.NORTH);
    }
    if (this.editorTabScrolling) {
        panelShell = new JScrollPane(panelShell);
        panelShell.setBorder(BorderFactory.createEmptyBorder());
        panelShell.setHorizontalScrollBarPolicy(ScrollPaneConstants.HORIZONTAL_SCROLLBAR_NEVER);
        panelShell.setVerticalScrollBarPolicy(ScrollPaneConstants.VERTICAL_SCROLLBAR_AS_NEEDED);
        panelShell.getVerticalScrollBar().setUnitIncrement(16);
    }
    panelShell.putClientProperty("se-custom-tab", tabTitle);
    panelShell.setName(tabTitle);
    tabPane.add(panelShell, tabIndex ?? tabPane.getTabCount() - 1);

    // an editor that is not showing can reset to the new preferred splitter size
    if (!editor.isShowing()) {
        const splitter = tabPane.getParent();
        if (splitter instanceof JSplitPane) {
            splitter["setDividerLocation(int)"](-1);
        }
    }
    if (heartbeatListener) {
        editor.addHeartbeatListener(heartbeatListener);
    }
    if (fieldPopulationListener) {
        editor.addFieldPopulationListener(fieldPopulationListener);
    }
    return panel;
};

AbstractContainer.findEditorTabPane = function findEditorTabPane(editor) {
    if (!editor) {
        return null;
    }
    const splitter = editor.getContentPane().getComponent(0);
    if (splitter instanceof JTabbedPane) {
        return splitter;
    }
    if (splitter instanceof JSplitPane) {
        let tabPane = splitter.getLeftComponent();
        if (tabPane instanceof JSplitPane) {
            tabPane = tabPane.getTopComponent();
        } else if (tabPane instanceof JPanel) {
            tabPane = tabPane.getComponent(0);
        }
        if (tabPane instanceof JTabbedPane) {
            return tabPane;
        }
    }
    return null;
};

AbstractContainer.prototype.createDialog = function createDialog(title, okText = null, cancelText = null, icon, modal) {
    const content = this.realize();
    const dialog = new UILibraryDialogTemplate(
            Eons.getWindow(), modal ?? true, content,
            icon === undefined ? UILibraryDialogTemplate.getDefaultIcon() : icon, okText, cancelText);
    dialog.setTitle(title ?? string("plug-user"));
    return dialog;
};

AbstractContainer.prototype.test = function test() {
    this.createDialog(null, "", null, null).showDialog();
};

export function Row(...controls) {
    AbstractContainer.call(this, controls);
    this.gap = 8;
    this._growTextControls = true;

    let alignment = -1;
    this.setAlignment = function setAlignment(align) {
        if (align < -1 || align > 1) {
            throw new Error("invalid alignment: " + align);
        }
        alignment = align;
    };
    this.getAlignment = () => alignment;
}
Row.subclass(AbstractContainer);

Row.prototype.realize = function realize() {
    this._checkRealized();
    const content = new JPanel();
    let alignment = FlowLayout.CENTER;
    if (this.getAlignment() < 0) {
        alignment = FlowLayout.LEADING;
    } else if (this.getAlignment() > 0) {
        alignment = FlowLayout.TRAILING;
    }
    const layout = new FlowLayout(alignment, 0, 0);
    layout.setAlignOnBaseline(true);
    content.setLayout(layout);

    this.controls.forEach((control, i) => {
        const hint = this.hints[i] ?? (i > 0 ? 1 : 0);
        if (hint > 0) {
            const spacer = new JLabel();
            spacer.setBorder(BorderFactory.createEmptyBorder(0, Math.trunc(this.gap * hint), 0, 0));
            content.add(spacer);
        }
        content.add(this._controlToComponent(control));
    });
    return this._applyTitle(content);
};

export function Stack(...controls) {
    AbstractContainer.call(this, controls);
    this._growTextControls = true;
}
Stack.subclass(AbstractContainer);

Stack.prototype.realize = function realize() {
    this._checkRealized();
    return this._applyTitle(UILibraryHelper.createStack(this._controlsToArray()));
};

export function FixedGrid(columns, ...controls) {
    AbstractContainer.call(this);
    this._growTextControls = true;
    const columnCount = columns || 2;
    this.getColumnCount = () => columnCount;
    this.getColumns = columnCount;
    this.add(...controls);
}
FixedGrid.subclass(AbstractContainer);

FixedGrid.prototype.realize = function realize() {
    this._checkRealized();
    const cols = this.getColumnCount();
    const panel = new JPanel(new GridBagLayout());
    const cons = new GridBagConstraints();
    const insets = new Insets(0, 5, 3, 0);
    const endInsets = new Insets(0, 5, 3, 5);

    cons.gridx = 0;
    cons.gridy = 0;
    cons.gridwidth = 1;
    cons.gridheight = 1;
    cons.anchor = GridBagConstraints.BASELINE_LEADING;
    cons.insets = insets;

    this.controls.forEach((control, i) => {
        const lineEnd = this.hints[i] === "wrap" || cons.gridx === cols - 1;
        cons.insets = lineEnd ? endInsets : insets;
        cons.gridwidth = lineEnd ? GridBagConstraints.REMAINDER : 1;
        panel.add(this._controlToComponent(control), cons);
        if (lineEnd) {
            cons.gridx = 0;
            cons.gridy = cons.gridy + 1;
        } else {
            cons.gridx = cons.gridx + 1;
        }
    });

    const outerPanel = new JPanel(new BorderLayout());
    outerPanel.add(panel, BorderLayout.LINE_START);
    return this._applyTitle(outerPanel);
};

export function Grid(layoutConstraints, columnConstraints, rowConstraints) {
    const layout = new MigLayout(layoutConstraints || "", columnConstraints || "", rowConstraints || "");
    this._getLayout = () => layout;
    AbstractContainer.call(this);
}
Grid.subclass(AbstractContainer);

Grid.prototype.realize = function realize() {
    this._checkRealized();
    const content = new JPanel(this._getLayout());
    this.controls.forEach((control, i) => {
        content["add(java.awt.Component,java.lang.Object)"](
                this._controlToComponent(control), this.hints[i] ? this.hints[i].toString() : null);
    });
    return this._applyTitle(content);
};

export function TypeGrid(hgap, vgap) {
    this.hgap = hgap;
    this.vgap = vgap;
    AbstractContainer.call(this);
}
TypeGrid.subclass(AbstractContainer);

TypeGrid.prototype.realize = function realize() {
    this._checkRealized();
    const layout = new RiverLayout();
    if (this.hgap !== undefined) {
        layout.setHgap(this.hgap);
    }
    if (this.vgap !== undefined) {
        layout.setVgap(this.vgap);
    }
    const content = new JPanel(layout);
    this.controls.forEach((control, i) => {
        content["add(java.awt.Component,java.lang.Object)"](
                this._controlToComponent(control),
                this.hints[i] ? this.hints[i].toString().replace(/,/g, " ") : null);
    });
    return this._applyTitle(content);
};

export function TabPane(...controls) {
    AbstractContainer.call(this, controls);
    this.smallTabs = false;
}
TabPane.subclass(AbstractContainer);

TabPane.prototype.realize = function realize() {
    this._checkRealized();
    const tabPane = new JTabbedPane();
    this.controls.forEach((control, i) => {
        const hint = this.hints[i] ?? "Tab " + (i + 1);
        if (hint instanceof JComponent) {
            tabPane["addTab(java.lang.String,java.awt.Component)"](null, this._controlToComponent(control));
            tabPane.setTabComponentAt(i, hint);
        } else {
            tabPane["addTab(java.lang.String,java.awt.Component)"](hint.toString(), this._controlToComponent(control));
        }
    });
    if (this.smallTabs) {
        const font = tabPane.getFont();
        tabPane.setFont(font["deriveFont(float)"](font.getSize2D() - 2));
    }
    return this._applyTitle(tabPane);
};

export function Splitter(verticalSplit, left, right) {
    AbstractContainer.call(this);
    this.verticalSplit = verticalSplit;
    if (left) {
        this.add(left);
    }
    if (right) {
        this.add(right);
    }
}
Splitter.subclass(AbstractContainer);

Splitter.prototype.realize = function realize() {
    this._checkRealized();
    const left = this._controlToComponent(this.controls[0] ?? "");
    const right = this._controlToComponent(this.controls[1] ?? "");
    const content = new JSplitPane(
            this.verticalSplit ? JSplitPane.HORIZONTAL_SPLIT : JSplitPane.VERTICAL_SPLIT, true, left, right);
    content.setOneTouchExpandable(true);
    content.setDividerSize(8);
    content["setDividerLocation(int)"](-1);
    return this._applyTitle(content);
};
