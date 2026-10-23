import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pillxai_client/main.dart';

void main() {
  setUpAll(() async {
    await (FontLoader('NotoSansSC')
          ..addFont(rootBundle.load('assets/fonts/NotoSansCJKsc-Regular.otf')))
        .load();
  });

  testWidgets('登录校验、密码显隐与退出后清空凭据', (tester) async {
    await tester.pumpWidget(const PillxaiApp());
    await tester.pumpAndSettle();
    const account = ValueKey('login-account');
    const password = ValueKey('login-password');
    const submit = ValueKey('login-submit');
    expect(find.text('欢迎回来'), findsOneWidget);
    expect(find.byKey(const ValueKey('nav-1')), findsNothing);
    await tester.tap(find.byKey(submit));
    await tester.pumpAndSettle();
    expect(find.text('请输入账号'), findsOneWidget);
    expect(find.text('请输入密码'), findsOneWidget);
    await tester.enterText(find.byKey(account), 'wrong-account');
    await tester.enterText(find.byKey(password), 'wrong-password');
    await tester.ensureVisible(find.byKey(submit));
    await tester.tap(find.byKey(submit));
    await tester.pumpAndSettle();
    expect(find.text('账号或密码不正确，请重新输入。'), findsOneWidget);
    expect(find.byKey(const ValueKey('nav-1')), findsNothing);
    await tester.tap(find.byTooltip('显示密码'));
    await tester.pumpAndSettle();
    final field = find.descendant(
      of: find.byKey(password),
      matching: find.byType(TextField),
    );
    expect(tester.widget<TextField>(field).obscureText, isFalse);
    await tester.enterText(find.byKey(account), 'admin');
    await tester.enterText(find.byKey(password), 'admin123');
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(password));
    await tester.showKeyboard(find.byKey(password));
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('prepare-r1')), findsOneWidget);
    expect(find.text('管理员'), findsOneWidget);
    expect(find.text('院内管理员'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('account-menu')));
    await tester.pumpAndSettle();
    expect(find.text('院内管理员'), findsNWidgets(2));
    await tester.tap(find.text('退出当前用户'));
    await tester.pumpAndSettle();
    expect(find.text('欢迎回来'), findsOneWidget);
    expect(
      tester.widget<TextFormField>(find.byKey(account)).controller!.text,
      isEmpty,
    );
    expect(
      tester.widget<TextFormField>(find.byKey(password)).controller!.text,
      isEmpty,
    );
    expect(tester.widget<TextField>(field).obscureText, isTrue);
    expect(tester.takeException(), isNull);
  });

  for (final size in [const Size(1280, 800), const Size(390, 844)]) {
    testWidgets('登录表单在 $size 和键盘弹出后可操作', (tester) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetViewInsets);
      await tester.pumpWidget(const PillxaiApp());
      await tester.pumpAndSettle();
      tester.view.viewInsets = const FakeViewPadding(bottom: 300);
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const ValueKey('login-submit')));
      await tester.tap(find.byKey(const ValueKey('login-submit')));
      await tester.pumpAndSettle();
      expect(find.text('请输入账号'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
}
