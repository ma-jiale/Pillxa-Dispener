import 'package:flutter/material.dart';

ThemeData createTheme({Color accent = const Color(0xff191919)}) {
  const ink = Color(0xff191919);
  final onAccent = accent.computeLuminance() > .45 ? ink : Colors.white;
  final shape = RoundedRectangleBorder(
    borderRadius: BorderRadius.circular(100),
  );
  return ThemeData(
    useMaterial3: true,
    fontFamily: 'NotoSansSC',
    colorScheme: ColorScheme.light(
      primary: accent,
      onPrimary: onAccent,
      secondary: const Color(0xff535353),
      onSecondary: Colors.white,
      surface: Colors.white,
      onSurface: ink,
      outline: const Color(0xffd7d7d7),
      error: const Color(0xffa62929),
    ),
    scaffoldBackgroundColor: const Color(0xfffafafa),
    scrollbarTheme: const ScrollbarThemeData(
      thumbColor: WidgetStatePropertyAll(Color(0xffbdbdbd)),
      thickness: WidgetStatePropertyAll(3),
      radius: Radius.circular(4),
    ),
    splashFactory: NoSplash.splashFactory,
    highlightColor: Colors.transparent,
    hoverColor: const Color(0x08000000),
    focusColor: const Color(0x10000000),
    menuTheme: MenuThemeData(
      style: MenuStyle(
        backgroundColor: const WidgetStatePropertyAll(Colors.white),
        surfaceTintColor: const WidgetStatePropertyAll(Colors.transparent),
        shadowColor: const WidgetStatePropertyAll(Color(0x18000000)),
        elevation: const WidgetStatePropertyAll(8),
        padding: const WidgetStatePropertyAll(EdgeInsets.all(6)),
        shape: WidgetStatePropertyAll(
          RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: const BorderSide(color: Color(0xffe5e5e3)),
          ),
        ),
      ),
    ),
    menuButtonTheme: MenuButtonThemeData(
      style: ButtonStyle(
        minimumSize: const WidgetStatePropertyAll(Size(0, 44)),
        padding: const WidgetStatePropertyAll(
          EdgeInsets.symmetric(horizontal: 12),
        ),
        foregroundColor: const WidgetStatePropertyAll(ink),
        iconColor: const WidgetStatePropertyAll(Color(0xff666666)),
        textStyle: const WidgetStatePropertyAll(
          TextStyle(
            fontFamily: 'NotoSansSC',
            fontSize: 13,
            fontWeight: FontWeight.w400,
          ),
        ),
        shape: WidgetStatePropertyAll(
          RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        ),
        overlayColor: const WidgetStatePropertyAll(Color(0x0a000000)),
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      shadowColor: const Color(0x20000000),
      elevation: 8,
      barrierColor: const Color(0x33000000),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: const BorderSide(color: Color(0xffe5e5e3)),
      ),
      titleTextStyle: const TextStyle(
        fontFamily: 'NotoSansSC',
        fontSize: 18,
        fontWeight: FontWeight.w600,
        color: ink,
      ),
      contentTextStyle: const TextStyle(
        fontFamily: 'NotoSansSC',
        fontSize: 13,
        height: 1.65,
        color: Color(0xff737373),
      ),
      actionsPadding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
    ),
    datePickerTheme: DatePickerThemeData(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      shadowColor: const Color(0x20000000),
      elevation: 8,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: const BorderSide(color: Color(0xffe5e5e3)),
      ),
      headerBackgroundColor: Colors.white,
      headerForegroundColor: ink,
      headerHeadlineStyle: const TextStyle(
        fontFamily: 'NotoSansSC',
        fontSize: 24,
        fontWeight: FontWeight.w500,
      ),
      dividerColor: const Color(0xffe8e8e6),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        minimumSize: const Size(44, 44),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(
          fontFamily: 'NotoSansSC',
          fontSize: 13,
          fontWeight: FontWeight.w500,
        ),
      ),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: const WidgetStatePropertyAll(Colors.white),
      thumbIcon: const WidgetStatePropertyAll(
        Icon(Icons.circle, color: Colors.white, size: 18),
      ),
      trackOutlineColor: const WidgetStatePropertyAll(Colors.transparent),
      trackColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected)
            ? accent
            : const Color(0xffdcdcdc),
      ),
      overlayColor: const WidgetStatePropertyAll(Colors.transparent),
      splashRadius: 0,
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: const Color(0xff242424),
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      contentTextStyle: const TextStyle(
        fontFamily: 'NotoSansSC',
        color: Colors.white,
        fontSize: 13,
      ),
    ),
    textTheme: const TextTheme(
      headlineMedium: TextStyle(
        fontSize: 28,
        fontWeight: FontWeight.w600,
        letterSpacing: -1,
      ),
      headlineSmall: TextStyle(fontSize: 23, fontWeight: FontWeight.w600),
      titleLarge: TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
      titleMedium: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
      bodyLarge: TextStyle(fontSize: 15, height: 1.6),
      bodyMedium: TextStyle(fontSize: 14, height: 1.5),
      bodySmall: TextStyle(fontSize: 12, height: 1.5, color: Color(0xff717171)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(48, 48),
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
        shape: shape,
        textStyle: const TextStyle(
          fontFamily: 'NotoSansSC',
          fontSize: 14,
          fontWeight: FontWeight.w600,
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(48, 48),
        shape: shape,
        foregroundColor: ink,
        side: const BorderSide(color: Color(0xffd5d5d5)),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: const Color(0xfff5f5f4),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide.none,
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: ink),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    ),
    dividerColor: const Color(0xffe6e6e6),
    dividerTheme: const DividerThemeData(
      color: Color(0xffe6e6e6),
      thickness: 1,
    ),
    tooltipTheme: TooltipThemeData(
      waitDuration: Duration(milliseconds: 400),
      decoration: BoxDecoration(
        color: const Color(0xff292929),
        borderRadius: BorderRadius.circular(8),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      textStyle: const TextStyle(
        fontFamily: 'NotoSansSC',
        color: Colors.white,
        fontSize: 12,
      ),
    ),
    sliderTheme: const SliderThemeData(trackHeight: 3),
  );
}

class Surface extends StatelessWidget {
  const Surface({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(24),
    this.color,
  });
  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color? color;

  @override
  Widget build(BuildContext context) => Container(
    padding: padding,
    decoration: BoxDecoration(
      color: color ?? Colors.white,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: const Color(0xffe3e3e3)),
    ),
    child: child,
  );
}
