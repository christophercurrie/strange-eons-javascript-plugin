package org.strangeeons.graaljs;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URL;
import java.nio.ByteBuffer;
import java.nio.channels.NonWritableChannelException;
import java.nio.channels.SeekableByteChannel;
import java.nio.file.AccessDeniedException;
import java.nio.file.AccessMode;
import java.nio.file.DirectoryStream;
import java.nio.file.InvalidPathException;
import java.nio.file.LinkOption;
import java.nio.file.NoSuchFileException;
import java.nio.file.OpenOption;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.FileAttribute;
import java.nio.file.attribute.FileTime;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import org.graalvm.polyglot.io.FileSystem;

/**
 * Serves {@code strange-eons/*} module specifiers from this plug-in's bundle
 * and passes every other path to the default file system.
 *
 * <p>{@code import "strange-eons/ui"} reads the resource
 * {@code strange-eons/ui.mjs}. Each bundled module maps to a path under a
 * reserved root, so relative imports between bundled modules resolve normally.
 * A specifier that escapes the namespace is rejected, and after {@link #seal}
 * so is one that names {@code strange-eons/internal}.
 *
 * <p>Modules that belong to other plug-ins map to a second reserved root and
 * are read through a resolver, so their relative imports also resolve normally.
 */
final class BundledModuleFileSystem implements FileSystem {

    private static final String PREFIX = "strange-eons/";
    private static final String EXTENSION = ".mjs";
    private static final Path ROOT = Path.of("").toAbsolutePath().getRoot()
            .resolve(".strange-eons-bundled-modules");
    private static final Path NAMESPACE = ROOT.resolve(PREFIX);
    private static final Path INTERNAL = NAMESPACE.resolve("internal");
    private static final Path RESOURCES = Path.of("").toAbsolutePath().getRoot()
            .resolve(".strange-eons-plugin-resources");

    private final FileSystem delegate = FileSystem.newDefaultFileSystem();
    private final ClassLoader loader;
    private final Function<String, URL> resources;
    private volatile boolean sealed;

    BundledModuleFileSystem(ClassLoader loader) {
        this(loader, name -> null);
    }

    /**
     * @param resources maps a resource name to its location, or to {@code null}
     *     if the name cannot be located
     */
    BundledModuleFileSystem(ClassLoader loader, Function<String, URL> resources) {
        this.loader = loader;
        this.resources = resources;
    }

    /**
     * Returns the path that a plug-in resource's module is imported from.
     *
     * @throws InvalidPathException if the name escapes the plug-in resources
     */
    static Path resourcePath(String name) {
        Path path = RESOURCES.resolve(name).normalize();
        if (!path.startsWith(RESOURCES) || path.equals(RESOURCES)) {
            throw new InvalidPathException(name, "not a plug-in resource");
        }
        return path;
    }

    /** Returns whether a plug-in resource exists. */
    boolean hasResource(Path path) {
        try {
            requireResource(path);
            return true;
        } catch (NoSuchFileException e) {
            return false;
        }
    }

    @Override
    public Path parsePath(String path) {
        if (path.startsWith(PREFIX)) {
            String name = path.endsWith(EXTENSION) ? path : path + EXTENSION;
            Path resolved = ROOT.resolve(name).normalize();
            if (!resolved.startsWith(NAMESPACE)) {
                throw new InvalidPathException(path, "escapes the bundled module namespace");
            }
            return requirePublic(resolved, path);
        }
        return requirePublic(delegate.parsePath(path), path);
    }

    @Override
    public Path parsePath(URI uri) {
        return requirePublic(delegate.parsePath(uri), uri.toString());
    }

    @Override
    public void checkAccess(Path path, Set<? extends AccessMode> modes, LinkOption... options)
            throws IOException {
        if (!isBundled(path)) {
            delegate.checkAccess(path, modes, options);
            return;
        }
        requireResource(path);
        if (modes.contains(AccessMode.WRITE) || modes.contains(AccessMode.EXECUTE)) {
            throw new AccessDeniedException(path.toString());
        }
    }

    @Override
    public SeekableByteChannel newByteChannel(Path path, Set<? extends OpenOption> options,
            FileAttribute<?>... attrs) throws IOException {
        if (!isBundled(path)) {
            return delegate.newByteChannel(path, options, attrs);
        }
        for (OpenOption option : options) {
            if (option != StandardOpenOption.READ) {
                throw new AccessDeniedException(path.toString());
            }
        }
        try (InputStream in = requireResource(path).openStream()) {
            return new ReadOnlyChannel(in.readAllBytes());
        }
    }

    @Override
    public Map<String, Object> readAttributes(Path path, String attributes, LinkOption... options)
            throws IOException {
        if (!isBundled(path)) {
            return delegate.readAttributes(path, attributes, options);
        }
        long size;
        try (InputStream in = requireResource(path).openStream()) {
            size = in.readAllBytes().length;
        }
        FileTime epoch = FileTime.fromMillis(0);
        Map<String, Object> result = new HashMap<>();
        result.put("lastModifiedTime", epoch);
        result.put("lastAccessTime", epoch);
        result.put("creationTime", epoch);
        result.put("isRegularFile", true);
        result.put("isDirectory", false);
        result.put("isSymbolicLink", false);
        result.put("isOther", false);
        result.put("size", size);
        return result;
    }

    @Override
    public Path toAbsolutePath(Path path) {
        return isBundled(path) ? path.normalize() : delegate.toAbsolutePath(path);
    }

    @Override
    public Path toRealPath(Path path, LinkOption... options) throws IOException {
        if (!isBundled(path)) {
            return delegate.toRealPath(path, options);
        }
        requireResource(path);
        return path.normalize();
    }

    @Override
    public void createDirectory(Path dir, FileAttribute<?>... attrs) throws IOException {
        requireWritable(dir);
        delegate.createDirectory(dir, attrs);
    }

    @Override
    public void delete(Path path) throws IOException {
        requireWritable(path);
        delegate.delete(path);
    }

    @Override
    public DirectoryStream<Path> newDirectoryStream(Path dir, DirectoryStream.Filter<? super Path> filter)
            throws IOException {
        if (isBundled(dir)) {
            throw new NoSuchFileException(dir.toString());
        }
        return delegate.newDirectoryStream(dir, filter);
    }

    @Override
    public void setCurrentWorkingDirectory(Path dir) {
        delegate.setCurrentWorkingDirectory(dir);
    }

    /**
     * Stops plug-in specifiers from naming internal modules. Relative imports
     * between bundled modules are resolved from the importer's path and do not
     * pass through {@link #parsePath}.
     */
    void seal() {
        sealed = true;
    }

    private Path requirePublic(Path path, String specifier) {
        if (sealed && delegate.toAbsolutePath(path).normalize().startsWith(INTERNAL)) {
            throw new InvalidPathException(specifier, "internal module");
        }
        return path;
    }

    private static boolean isBundled(Path path) {
        if (!path.isAbsolute()) {
            return false;
        }
        Path normal = path.normalize();
        return normal.startsWith(NAMESPACE) || normal.startsWith(RESOURCES);
    }

    private static void requireWritable(Path path) throws IOException {
        if (isBundled(path)) {
            throw new AccessDeniedException(path.toString());
        }
    }

    private URL requireResource(Path path) throws NoSuchFileException {
        Path normal = path.normalize();
        if (normal.startsWith(RESOURCES)) {
            return requirePluginResource(normal);
        }
        URL url = loader.getResource(resourceName(ROOT.relativize(normal)));
        if (url == null) {
            throw new NoSuchFileException(path.toString());
        }
        return url;
    }

    private URL requirePluginResource(Path path) throws NoSuchFileException {
        URL url = resources.apply(resourceName(RESOURCES.relativize(path)));
        if (url == null) {
            throw new NoSuchFileException(path.toString());
        }
        // A res: URL can be made for any name; only opening it finds out.
        try (InputStream in = url.openStream()) {
            return url;
        } catch (IOException e) {
            throw new NoSuchFileException(path.toString());
        }
    }

    private static String resourceName(Path relative) {
        StringBuilder name = new StringBuilder();
        for (Path part : relative) {
            if (name.length() > 0) {
                name.append('/');
            }
            name.append(part);
        }
        return name.toString();
    }

    private static final class ReadOnlyChannel implements SeekableByteChannel {
        private final ByteBuffer buffer;
        private boolean open = true;

        ReadOnlyChannel(byte[] bytes) {
            buffer = ByteBuffer.wrap(bytes);
        }

        @Override
        public int read(ByteBuffer dst) {
            if (!buffer.hasRemaining()) {
                return -1;
            }
            int count = Math.min(dst.remaining(), buffer.remaining());
            ByteBuffer slice = buffer.slice().limit(count);
            dst.put(slice);
            buffer.position(buffer.position() + count);
            return count;
        }

        @Override
        public int write(ByteBuffer src) {
            throw new NonWritableChannelException();
        }

        @Override
        public long position() {
            return buffer.position();
        }

        @Override
        public SeekableByteChannel position(long newPosition) {
            buffer.position((int) Math.min(newPosition, buffer.limit()));
            return this;
        }

        @Override
        public long size() {
            return buffer.limit();
        }

        @Override
        public SeekableByteChannel truncate(long size) {
            throw new NonWritableChannelException();
        }

        @Override
        public boolean isOpen() {
            return open;
        }

        @Override
        public void close() {
            open = false;
        }
    }
}
