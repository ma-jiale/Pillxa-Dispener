import { useState, useId } from "react";
import { ImagePlus } from "lucide-react";
import { Failure } from "./components.tsx";
export function ImagePicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const id = useId(),
    [error, setError] = useState<unknown>();
  return (
    <div className="image-picker">
      {value && <img src={value} alt={label} />}
      <div>
        <label className="button" htmlFor={id}>
          <ImagePlus size={16} />
          {value ? "更换图片" : "添加图片"}
        </label>
        <input
          id={id}
          aria-label={label}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setError(undefined);
            if (
              !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
              file.size > 2 * 1024 * 1024
            ) {
              setError(
                new Error("请选择不超过 2 MB 的 PNG、JPEG 或 WebP 图片。"),
              );
              return;
            }
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result === "string") onChange(reader.result);
            };
            reader.onerror = () =>
              setError(new Error("图片读取失败，请重新选择。"));
            reader.readAsDataURL(file);
          }}
        />
        {value && (
          <button type="button" className="link" onClick={() => onChange("")}>
            移除图片
          </button>
        )}
        <p className="hint">可选 · PNG、JPEG 或 WebP · 最大 2 MB</p>
        <Failure error={error} />
      </div>
    </div>
  );
}
