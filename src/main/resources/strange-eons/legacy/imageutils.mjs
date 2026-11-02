// Bitmapped image support, adapted from Strange Eons' imageutils.js.
import { Java } from "../internal/host.mjs";
import { Eons, ResourceKit, Settings, string } from "./common.mjs";

export const BufferedImage = Java.type("java.awt.image.BufferedImage");

const File = Java.type("java.io.File");
const ImageIO = Java.type("javax.imageio.ImageIO");
const ImageIcon = Java.type("javax.swing.ImageIcon");
const ImageUtilities = Java.type("ca.cgjennings.graphics.ImageUtilities");
const ImageViewer = Java.type("ca.cgjennings.apps.arkham.dialog.ImageViewer");
const ErrorDialog = Java.type("ca.cgjennings.apps.arkham.dialog.ErrorDialog");
const JFileChooser = Java.type("javax.swing.JFileChooser");
const MultiResolutionImageResource = Java.type("ca.cgjennings.graphics.MultiResolutionImageResource");
const ProjectUtilities = Java.type("ca.cgjennings.apps.arkham.project.ProjectUtilities");
const RenderingHints = Java.type("java.awt.RenderingHints");
const SimpleImageWriter = Java.type("ca.cgjennings.imageio.SimpleImageWriter");
const ThemedImageIcon = Java.type("ca.cgjennings.ui.theme.ThemedImageIcon");
const TintFilter = Java.type("ca.cgjennings.graphics.filters.TintFilter");
const Transparency = Java.type("java.awt.Transparency");

const valDimen = (dim) => {
    if (isNaN(dim)) {
        throw new TypeError("dimension is not a number: " + dim);
    }
    if (dim < 1 || dim > 40000) {
        throw new RangeError("bad image dimension: " + dim);
    }
    return Math.trunc(dim);
};

const valImage = (im) => {
    if (!(im instanceof BufferedImage)) {
        throw new TypeError("not an image: " + im);
    }
    return im;
};

const valNum = (x) => {
    if (isNaN(x)) {
        throw new TypeError("coordinate is not a number: " + x);
    }
    return Math.trunc(x);
};

const toFile = (file) => (file instanceof File ? file : new File(String(file)));

export const ImageUtils = {
    STITCH_HORIZONTAL: 1,
    STITCH_VERTICAL: 2,
    FORMAT_PNG: SimpleImageWriter.FORMAT_PNG,
    FORMAT_JPEG: SimpleImageWriter.FORMAT_JPEG,
    FORMAT_JPEG2000: SimpleImageWriter.FORMAT_JPEG2000,
    FORMAT_BMP: SimpleImageWriter.FORMAT_BMP,
    FORMAT_GIF: SimpleImageWriter.FORMAT_GIF,

    create(width, height, transparent) {
        const type = transparent ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB;
        return new BufferedImage(valDimen(width), valDimen(height), type);
    },

    createForResolution(ppi, width, height, transparent) {
        if (isNaN(ppi)) {
            throw new TypeError("resolution is not a number: " + ppi);
        }
        if (ppi <= 0) {
            throw new RangeError("bad resolution " + ppi);
        }
        return ImageUtils.create(width / 72 * ppi, height / 72 * ppi, transparent);
    },

    get(resPath, cacheResult, quietly) {
        if (cacheResult || cacheResult === undefined) {
            return quietly ? ResourceKit.getImageQuietly(resPath) : ResourceKit.getImage(resPath);
        }
        let im = null;
        const url = ResourceKit.composeResourceURL(resPath);
        if (url) {
            im = ImageIO.read(url);
        }
        if (im) {
            im = ResourceKit.prepareNewImage(im);
        }
        if (im === null && !quietly) {
            ErrorDialog.displayErrorOnce(resPath, string("rk-err-image-resource", resPath), null);
        }
        return im;
    },

    getMultiRes(resPath) {
        return new MultiResolutionImageResource(resPath);
    },

    getIcon(resPath, unthemed) {
        return unthemed ? new ImageIcon(ImageUtils.getMultiRes(resPath)) : new ThemedImageIcon(resPath);
    },

    createIcon(image, size) {
        return ImageUtilities.createIconForSize(valImage(image), isNaN(size) || size < 1 ? 18 : Math.trunc(size));
    },

    copy(image) {
        return ImageUtilities.copy(valImage(image));
    },

    stitch(image1, image2, stitchEdge) {
        valImage(image1);
        valImage(image2);
        const horizontal = stitchEdge === ImageUtils.STITCH_HORIZONTAL;
        if (!horizontal && stitchEdge !== ImageUtils.STITCH_VERTICAL) {
            throw new TypeError("invalid stitchEdge: " + stitchEdge);
        }
        const transparent = image1.getTransparency() !== Transparency.OPAQUE
                || image2.getTransparency() !== Transparency.OPAQUE;
        const im = horizontal
                ? ImageUtils.create(image1.getWidth() + image2.getWidth(),
                        Math.max(image1.getHeight(), image2.getHeight()), transparent)
                : ImageUtils.create(Math.max(image1.getWidth(), image2.getWidth()),
                        image1.getHeight() + image2.getHeight(), transparent);
        const g = im.createGraphics();
        try {
            g.drawImage(image1, 0, 0, null);
            if (horizontal) {
                g.drawImage(image2, image1.getWidth(), 0, null);
            } else {
                g.drawImage(image2, 0, image1.getHeight(), null);
            }
        } finally {
            g.dispose();
        }
        return im;
    },

    resize(image, width, height, fast) {
        if (fast) {
            return ImageUtilities.resample(valImage(image), valDimen(width), valDimen(height), false,
                    RenderingHints.VALUE_INTERPOLATION_NEAREST_NEIGHBOR, null);
        }
        return ImageUtilities.resample(valImage(image), valDimen(width), valDimen(height));
    },

    fit(image, width, height, fast) {
        valImage(image);
        valDimen(width);
        valDimen(height);
        const w = image.getWidth();
        const h = image.getHeight();
        if ((w === width && h <= height) || (h === height && w <= width)) {
            return image;
        }
        const scale = Math.min(width / w, height / h);
        return ImageUtils.resize(image, Math.round(w * scale), Math.round(h * scale), fast);
    },

    crop(image, x, y, width, height) {
        valImage(image);
        const left = valNum(x);
        const top = valNum(y);
        const w = valDimen(width == null || width < 1 ? image.getWidth() - left : width);
        const h = valDimen(height == null || height < 1 ? image.getHeight() - top : height);
        const dest = ImageUtilities.createCompatibleIntRGBFormat(image, w, h);
        const g = dest.createGraphics();
        try {
            g.drawImage(image, -left, -top, null);
        } finally {
            g.dispose();
        }
        return dest;
    },

    pad(image, top, left, bottom, right) {
        if (left == null) {
            left = bottom = right = top;
        }
        return ImageUtilities.pad(valImage(image), valNum(top), valNum(left), valNum(bottom), valNum(right));
    },

    tint(image, ...args) {
        let h, s, b;
        if (args.length === 1) {
            [h, s, b] = Array.from(args[0]);
        } else if (args.length === 3) {
            [h, s, b] = args;
        } else {
            throw new Error("missing (h, s, b)");
        }
        const filter = new TintFilter(Math.fround(h), Math.fround(s), Math.fround(b));
        return filter.filter(ImageUtilities.ensureIntRGBFormat(valImage(image)), null);
    },

    mirror(image, horiz = true, vert = false) {
        return ImageUtilities.flip(valImage(image), horiz ?? true, vert ?? false);
    },

    invert(image) {
        return ImageUtilities.invert(valImage(image));
    },

    desaturate(image) {
        return ImageUtilities.desaturate(valImage(image));
    },

    trim(image) {
        return ImageUtilities.trim(valImage(image));
    },

    read(file) {
        if (file == null) {
            throw new Error("missing file");
        }
        const image = ImageIO.read(toFile(file));
        if (image == null) {
            throw new Error("unable to read file");
        }
        return ResourceKit.prepareNewImage(image);
    },

    write(image, file, format, quality, progressive, ppi) {
        if (file == null) {
            throw new Error("missing file");
        }
        const writer = new SimpleImageWriter(format ?? ImageUtils.FORMAT_PNG);
        try {
            if (ppi === undefined) {
                writer.setMetadataEnabled(false);
            } else {
                writer.setPixelsPerInch(Math.fround(ppi));
            }
            writer.setCompressionQuality(Math.fround(quality ?? 0.75));
            writer.setProgressiveScan(progressive ?? false);
            writer.write(valImage(image), toFile(file));
        } finally {
            writer.dispose();
        }
    },

    save(image, defaultFile, parent) {
        valImage(image);
        const initial = defaultFile ?? Settings.getShared().get("default-image-folder");
        const chooser = ImageViewer.getFileChooser();
        chooser.setSelectedFile(initial == null ? null : toFile(initial));
        if (chooser.showSaveDialog(parent === undefined ? Eons.getWindow() : parent) != JFileChooser.APPROVE_OPTION) {
            return null;
        }
        const file = chooser.getSelectedFile();
        const ext = ProjectUtilities.getFileExtension(file);
        ImageUtils.write(image, file, ext.length > 0 ? ext : ImageUtils.FORMAT_PNG);
        const folder = file.getParentFile();
        if (folder != null) {
            Settings.getUser().set("default-image-folder", folder.getAbsolutePath());
        }
        return file;
    },

    view(image, title, modal = false, parent) {
        const dialog = new ImageViewer(parent === undefined ? Eons.getWindow() : parent, valImage(image), modal);
        if (title != null) {
            dialog.setTitle(title);
        }
        dialog.setLocationByPlatform(true);
        dialog.setVisible(true);
    }
};
