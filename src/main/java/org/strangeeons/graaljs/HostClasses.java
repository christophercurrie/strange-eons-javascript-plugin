package org.strangeeons.graaljs;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.List;

/**
 * Class information for library modules. Plug-in scripts cannot call
 * {@link Object#getClass()}, and cannot look up this class.
 */
public final class HostClasses {

    private HostClasses() {
    }

    /** Returns the binary name of a class, or of an object's class. */
    public static String name(Object classOrInstance) {
        return classOf(classOrInstance).getName();
    }

    /** Returns the simple name of an object's class. */
    public static String simpleName(Object instance) {
        return classOf(instance).getSimpleName();
    }

    /** Returns binary names from the class of an object up to {@code Object}. */
    public static String[] hierarchy(Object classOrInstance) {
        List<String> names = new ArrayList<>();
        for (Class<?> c = classOf(classOrInstance); c != null; c = c.getSuperclass()) {
            names.add(c.getName());
        }
        return names.toArray(String[]::new);
    }

    /**
     * Returns the binary name of the class that declares a public static field
     * or method of the named class.
     *
     * @throws IllegalArgumentException if the class has no such member
     */
    public static String declaringClass(String className, String member) throws ClassNotFoundException {
        Class<?> type = Class.forName(className, false, HostClasses.class.getClassLoader());
        for (Field field : type.getFields()) {
            if (field.getName().equals(member) && Modifier.isStatic(field.getModifiers())) {
                return field.getDeclaringClass().getName();
            }
        }
        for (Method method : type.getMethods()) {
            if (method.getName().equals(member) && Modifier.isStatic(method.getModifiers())) {
                return method.getDeclaringClass().getName();
            }
        }
        throw new IllegalArgumentException(className + " has no public static member " + member);
    }

    private static Class<?> classOf(Object classOrInstance) {
        return classOrInstance instanceof Class<?> c ? c : classOrInstance.getClass();
    }
}
