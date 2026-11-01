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
import org.graalvm.polyglot.io.FileSystem;

/**
 * Serves {@code strange-eons/*} module specifiers from this plug-in's bundle
 * and passes every other path to the default file system.
 *
 * <p>{@code import "strange-eons/ui"} reads the resource
 * {@code strange-eons/ui.mjs}. Each bundled module maps to a path under a
 * reserved root, so relative imports between bundled modules resolve normally.
 * A specifier that escapes the namespace is rejected.
 */
final class BundledModuleFileSystem implements FileSystem {

    private static final String PREFIX = "strange-eons/";
    private static final String EXTENSION = ".mjs";
    private static final Path ROOT = Path.of("").toAbsolutePath().getRoot()
            .resolve(".strange-eons-bundled-modules");
    private static final Path NAMESPACE = ROOT.resolve(PREFIX);

    private final FileSystem delegate = FileSystem.newDefaultFileSystem();
    private final ClassLoader loader;

    BundledModuleFileSystem(ClassLoader loader) {
        this.loader = loader;
    }

    @Override
    public Path parsePath(String path) {
        if (path.startsWith(PREFIX)) {
            String name = path.endsWith(EXTENSION) ? path : path + EXTENSION;
            Path resolved = ROOT.resolve(name).normalize();
            if (!resolved.startsWith(NAMESPACE)) {
                throw new InvalidPathException(path, "escapes the bundled module namespace");
            }
            return resolved;
        }
        return delegate.parsePath(path);
    }

    @Override
    public Path parsePath(URI uri) {
        return delegate.parsePath(uri);
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

    private static boolean isBundled(Path path) {
        return path.isAbsolute() && path.normalize().startsWith(NAMESPACE);
    }

    private static void requireWritable(Path path) throws IOException {
        if (isBundled(path)) {
            throw new AccessDeniedException(path.toString());
        }
    }

    private URL requireResource(Path path) throws NoSuchFileException {
        StringBuilder name = new StringBuilder();
        for (Path part : ROOT.relativize(path.normalize())) {
            if (name.length() > 0) {
                name.append('/');
            }
            name.append(part);
        }
        URL url = loader.getResource(name.toString());
        if (url == null) {
            throw new NoSuchFileException(path.toString());
        }
        return url;
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
