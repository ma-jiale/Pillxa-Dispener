import 'package:flutter/material.dart';

/// The same compact popover is used by selects and action menus.
class AppMenuAction {
  const AppMenuAction(this.label, this.onPressed, {this.icon});
  final String label;
  final VoidCallback onPressed;
  final IconData? icon;
}

class AppActionMenu extends StatelessWidget {
  const AppActionMenu({
    super.key,
    required this.tooltip,
    required this.actions,
    this.child,
    this.header,
  });
  final String tooltip;
  final List<AppMenuAction> actions;
  final Widget? child;
  final Widget? header;

  @override
  Widget build(BuildContext context) => MenuAnchor(
    useRootOverlay: true,
    alignmentOffset: const Offset(0, 6),
    style: const MenuStyle(maximumSize: WidgetStatePropertyAll(Size(280, 480))),
    menuChildren: [
      if (header != null) ...[
        SizedBox(
          width: 212,
          child: Padding(padding: const EdgeInsets.all(12), child: header!),
        ),
        const SizedBox(
          width: 212,
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            child: Divider(height: 1),
          ),
        ),
      ],
      for (final action in actions)
        SizedBox(
          width: 212,
          child: MenuItemButton(
            autofocus: action == actions.first,
            onPressed: action.onPressed,
            leadingIcon: action.icon == null
                ? null
                : Icon(action.icon, size: 18),
            child: Text(action.label),
          ),
        ),
    ],
    builder: (context, controller, _) {
      void toggle() =>
          controller.isOpen ? controller.close() : controller.open();
      if (child == null) {
        return IconButton(
          tooltip: tooltip,
          onPressed: toggle,
          icon: const Icon(Icons.more_horiz_rounded, size: 20),
        );
      }
      return Tooltip(
        message: tooltip,
        child: TextButton(
          onPressed: toggle,
          style: TextButton.styleFrom(
            padding: const EdgeInsets.all(8),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
          child: child!,
        ),
      );
    },
  );
}

class AppSelectOption<T> {
  const AppSelectOption(this.value, this.label);
  final T value;
  final String label;
}

class AppSelect<T> extends StatelessWidget {
  const AppSelect({
    super.key,
    required this.value,
    required this.options,
    required this.onChanged,
    required this.label,
    this.showLabel = false,
    this.validator,
  });
  final T value;
  final List<AppSelectOption<T>> options;
  final ValueChanged<T> onChanged;
  final String label;
  final bool showLabel;
  final FormFieldValidator<T>? validator;

  @override
  Widget build(BuildContext context) => FormField<T>(
    initialValue: value,
    validator: (_) => validator?.call(value),
    builder: (field) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (showLabel) ...[
          Text(
            label,
            style: const TextStyle(fontSize: 12, color: Color(0xff777777)),
          ),
          const SizedBox(height: 8),
        ],
        LayoutBuilder(
          builder: (context, bounds) {
            final width = bounds.maxWidth.clamp(160.0, 320.0);
            return MenuAnchor(
              useRootOverlay: true,
              alignmentOffset: const Offset(0, 6),
              style: MenuStyle(
                maximumSize: WidgetStatePropertyAll(Size(width, 400)),
              ),
              menuChildren: [
                for (final option in options)
                  SizedBox(
                    width: width - 12,
                    child: MenuItemButton(
                      autofocus: option.value == value,
                      style: ButtonStyle(
                        backgroundColor: WidgetStateProperty.resolveWith(
                          (states) =>
                              option.value == value ||
                                  states.contains(WidgetState.focused) ||
                                  states.contains(WidgetState.hovered)
                              ? const Color(0xfff0f0ef)
                              : Colors.transparent,
                        ),
                      ),
                      trailingIcon: option.value == value
                          ? const Icon(Icons.check_rounded, size: 16)
                          : const SizedBox(width: 16),
                      onPressed: () {
                        field.didChange(option.value);
                        onChanged(option.value);
                      },
                      child: Semantics(
                        selected: option.value == value,
                        child: Text(option.label),
                      ),
                    ),
                  ),
              ],
              builder: (context, controller, _) => Semantics(
                label: label,
                child: OutlinedButton(
                  onPressed: () => controller.isOpen
                      ? controller.close()
                      : controller.open(),
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size(0, 44),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 12,
                    ),
                    backgroundColor: Colors.white,
                    side: BorderSide(
                      color: field.hasError
                          ? Theme.of(context).colorScheme.error
                          : const Color(0xffdfdfdd),
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    textStyle: const TextStyle(
                      fontFamily: 'NotoSansSC',
                      fontSize: 13,
                    ),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          options.firstWhere((o) => o.value == value).label,
                        ),
                      ),
                      const SizedBox(width: 12),
                      const Icon(
                        Icons.keyboard_arrow_down_rounded,
                        size: 18,
                        color: Color(0xff858585),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
        if (field.hasError) ...[
          const SizedBox(height: 6),
          Text(
            field.errorText!,
            style: TextStyle(
              fontSize: 12,
              color: Theme.of(context).colorScheme.error,
            ),
          ),
        ],
      ],
    ),
  );
}
