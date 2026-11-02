// UI control helpers, adapted from Strange Eons' uicontrols.js.
import { Java } from "../internal/host.mjs";
import { assertDispatchThread, Language, ResourceKit } from "./common.mjs";

const pkg = "ca.cgjennings.apps.arkham";
const AutocompletionDocument = Java.type("ca.cgjennings.ui.AutocompletionDocument");
const AWTComponent = Java.type("java.awt.Component");
const BindableGroup = Java.type(`${pkg}.plugins.UILibraryHelper$BindableGroup`);
const ButtonGroup = Java.type("javax.swing.ButtonGroup");
const ContextBar = Java.type(`${pkg}.ContextBar`);
const DefaultComboBoxModel = Java.type("javax.swing.DefaultComboBoxModel");
const DefaultListModel = Java.type("javax.swing.DefaultListModel");
const Dimension = Java.type("java.awt.Dimension");
const Hashtable = Java.type("java.util.Hashtable");
const HSBPanel = Java.type(`${pkg}.HSBPanel`);
const JButton = Java.type("javax.swing.JButton");
const JCheckBox = Java.type("javax.swing.JCheckBox");
const JComboBox = Java.type("javax.swing.JComboBox");
const JCycleButton = Java.type("ca.cgjennings.ui.JCycleButton");
const JHelpButton = Java.type("ca.cgjennings.ui.JHelpButton");
const JLabel = Java.type("javax.swing.JLabel");
const JLinkLabel = Java.type("ca.cgjennings.ui.JLinkLabel");
const JList = Java.type("javax.swing.JList");
const JRadioButton = Java.type("javax.swing.JRadioButton");
const JRepeaterButton = Java.type("ca.cgjennings.ui.JRepeaterButton");
const JScrollPane = Java.type("javax.swing.JScrollPane");
const JSeparator = Java.type("javax.swing.JSeparator");
const JSlider = Java.type("javax.swing.JSlider");
const JSpellingComboBox = Java.type("ca.cgjennings.spelling.ui.JSpellingComboBox");
const JSpellingTextArea = Java.type("ca.cgjennings.spelling.ui.JSpellingTextArea");
const JSpellingTextField = Java.type("ca.cgjennings.spelling.ui.JSpellingTextField");
const JSpinner = Java.type("javax.swing.JSpinner");
const JTextArea = Java.type("javax.swing.JTextArea");
const JTextField = Java.type("javax.swing.JTextField");
const JTip = Java.type("ca.cgjennings.ui.JTip");
const JToggleButton = Java.type("javax.swing.JToggleButton");
const LinkedHashSet = Java.type("java.util.LinkedHashSet");
const ListItemRenderer = Java.type(`${pkg}.diy.ListItemRenderer`);
const ListSelectionModel = Java.type("javax.swing.ListSelectionModel");
const MarkupTarget = Java.type(`${pkg}.MarkupTarget`);
const PortraitPanel = Java.type(`${pkg}.PortraitPanel`);
const SwingConstants = Java.type("javax.swing.SwingConstants");
const SpinnerNumberModel = Java.type("javax.swing.SpinnerNumberModel");
const TreeSet = Java.type("java.util.TreeSet");
const UILibraryHelper = Java.type(`${pkg}.plugins.UILibraryHelper`);
const URI = Java.type("java.net.URI");

const size = (value) => (value === undefined || value < 0 ? 0 : Math.trunc(value));

function withActionListener(control, listener) {
    if (listener) {
        control.addActionListener(listener);
    }
    return control;
}

export function textField(text, columns, listener, spellingChecked = true) {
    assertDispatchThread();
    const field = spellingChecked
            ? new JSpellingTextField(text || "", size(columns))
            : new JTextField(text || "", size(columns));
    withActionListener(field, listener);
    field.setFont(ResourceKit.getEditorFont());
    field.select(0, 0);
    return field;
}

export function textArea(text, rows, columns, scroll, spellingChecked = true) {
    assertDispatchThread();
    const field = spellingChecked
            ? new JSpellingTextArea(text || "", size(rows), size(columns))
            : new JTextArea(text || "", size(rows), size(columns));
    field.setFont(ResourceKit.getEditorFont());
    field.select(0, 0);
    field.setLineWrap(true);
    field.setWrapStyleWord(true);
    field.setTabSize(4);
    return scroll ? new JScrollPane(field) : field;
}

export function codeArea(text, preferredWidth, preferredHeight) {
    assertDispatchThread();
    const field = UILibraryHelper.createCodeArea();
    field.setInitialText(text || "");
    field.setPreferredSize(new Dimension(
            !preferredWidth || preferredWidth < 1 ? 400 : Math.trunc(preferredWidth),
            !preferredHeight || preferredHeight < 1 ? 300 : Math.trunc(preferredHeight)));
    return field;
}

export function button(label, icon, listener) {
    assertDispatchThread();
    return withActionListener(new JButton(label || null, icon || null), listener);
}

export function repeaterButton(label, icon, listener) {
    assertDispatchThread();
    return withActionListener(new JRepeaterButton(label || null, icon || null), listener);
}

export function toggleButton(label, icon, selected, listener) {
    assertDispatchThread();
    const control = new JToggleButton(label || null, icon || null);
    control.setSelected(!!selected);
    return withActionListener(control, listener);
}

export function radioButton(label, selected, listener) {
    assertDispatchThread();
    const control = label ? new JRadioButton(label) : new JRadioButton();
    control.setSelected(!!selected);
    return withActionListener(control, listener);
}

export function buttonGroup(buttons, settingValues) {
    assertDispatchThread();
    if (settingValues !== undefined) {
        return new BindableGroup(buttons, settingValues);
    }
    const group = new ButtonGroup();
    for (const member of buttons) {
        group.add(member);
    }
    return group;
}

export function cycleButton(labels, settingValues) {
    assertDispatchThread();
    return settingValues == null ? new JCycleButton(labels) : new JCycleButton(labels, settingValues);
}

export function checkBox(label, selected, listener) {
    assertDispatchThread();
    const control = new JCheckBox(String(label ?? null));
    withActionListener(control, listener);
    control.setSelected(!!selected);
    return control;
}

export function comboBox(items, listener) {
    assertDispatchThread();
    const model = new DefaultComboBoxModel();
    for (const item of items || []) {
        model.addElement(item);
    }
    const control = new JComboBox(model);
    control.setRenderer(ListItemRenderer.getShared());
    control.setEditable(false);
    control.setMaximumRowCount(12);
    return withActionListener(control, listener);
}

export function autocompletionField(items, sorted) {
    assertDispatchThread();
    if (!items || items.length === undefined) {
        throw new Error("missing array of autocompletion items");
    }
    const set = sorted ? new TreeSet(Language.getInterface().getCollator()) : new LinkedHashSet();
    for (const item of items) {
        set.add(item);
    }
    const field = new JSpellingComboBox(set.toArray());
    field.setEditable(true);
    field.setFont(ResourceKit.getEditorFont());
    field.setMaximumRowCount(12);
    const document = AutocompletionDocument.install(field);
    if (sorted) {
        document.setCollator(Language.getInterface().getCollator());
    }
    return field;
}

export function listControl(items, listener, scroll) {
    assertDispatchThread();
    const model = new DefaultListModel();
    for (const item of items || []) {
        model.addElement(item);
    }
    const list = new JList(model);
    list.setCellRenderer(ListItemRenderer.getShared());
    list.setSelectionMode(ListSelectionModel.SINGLE_SELECTION);
    if (listener) {
        list.addListSelectionListener(listener);
    }
    return scroll ? new JScrollPane(list) : list;
}

export function label(text, labelFor) {
    const control = new JLabel(text == null ? "" : String(text));
    if (labelFor) {
        control.setLabelFor(labelFor);
    }
    return control;
}

export function noteLabel(text) {
    const note = label(text);
    const font = note.getFont();
    note.setFont(font["deriveFont(float)"](font.getSize2D() - 1));
    return note;
}

export function separator(vertical) {
    return vertical ? new JSeparator(SwingConstants.VERTICAL) : new JSeparator();
}

export function hyperlink(text, url) {
    assertDispatchThread();
    if (!text) {
        throw new Error("missing URL");
    }
    const field = new JLinkLabel(text);
    field.setURI(new URI(url || text));
    return field;
}

export function helpButton(url) {
    assertDispatchThread();
    if (!url) {
        throw new Error("missing URL");
    }
    const control = new JHelpButton();
    if (url.includes(":")) {
        control.setHelpPage(url);
    } else {
        control.setWikiPage(url);
    }
    return control;
}

export function tipButton(text) {
    assertDispatchThread();
    if (!text) {
        throw new Error("missing tip text");
    }
    const tip = text.includes("\n")
            ? "<html>" + text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")
            : text;
    return new JTip(tip);
}

export function spinner(min = 1, max = 10, stepSize, initialValue, listener) {
    assertDispatchThread();
    const control = new JSpinner(new SpinnerNumberModel(
            Math.trunc(initialValue ?? min), Math.trunc(min), Math.trunc(max), Math.trunc(stepSize || 1)));
    if (listener) {
        control.addChangeListener(listener);
    }
    return control;
}

export function slider(min = 1, max = 10, initial, valueLabelPairs, listener) {
    assertDispatchThread();
    const low = Math.trunc(min);
    const high = Math.max(low, Math.trunc(max));
    const control = new JSlider(low, high, Math.trunc(initial ?? low));
    if (listener) {
        control.addChangeListener(listener);
    }
    if (valueLabelPairs) {
        const dictionary = new Hashtable();
        for (let i = 0; i < valueLabelPairs.length; i += 2) {
            const text = valueLabelPairs[i + 1];
            dictionary.put(valueLabelPairs[i] | 0,
                    text instanceof AWTComponent ? text : noteLabel(text.toString()));
        }
        control.setLabelTable(dictionary);
        control.setPaintLabels(true);
    }
    return control;
}

export function tintPanel() {
    assertDispatchThread();
    const panel = new HSBPanel();
    panel.setPresetsVisible(false);
    return panel;
}

export function portraitPanel(gc, portraitIndex, title) {
    assertDispatchThread();
    const panel = new PortraitPanel();
    panel.setPortrait(gc.getPortrait(portraitIndex));
    if (title !== undefined) {
        panel.setPanelTitle(title);
    }
    return panel;
}

export function noMarkup(control) {
    control.putClientProperty(MarkupTarget.FORCE_MARKUP_TARGET_PROPERTY, false);
    control.putClientProperty(ContextBar.BAR_DISABLE_PROPERTY, true);
    return control;
}
