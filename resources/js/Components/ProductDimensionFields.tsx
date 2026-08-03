import DecimalInput from './DecimalInput';

type DimensionField = 'length' | 'width' | 'height';

interface Props {
  /** Produk kardus memakai Panjang x Lebar x Tinggi. */
  isBox: boolean;
  length: string;
  width: string;
  height: string;
  onChange: (field: DimensionField, value: string) => void;
  errors: Partial<Record<DimensionField, string>>;
  disabled?: boolean;
}

const INPUT_CLASS =
  'w-full px-4 py-2.5 rounded-xl bg-gray-50 border text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all';

/**
 * Ukuran produk: Panjang x Lebar untuk produk umum,
 * ditambah Tinggi bila produk berjenis kardus.
 */
export default function ProductDimensionFields({
  isBox,
  length,
  width,
  height,
  onChange,
  errors,
  disabled,
}: Props) {
  const fields: { key: DimensionField; label: string }[] = [
    { key: 'length', label: 'Panjang' },
    { key: 'width', label: 'Lebar' },
    ...(isBox ? [{ key: 'height' as const, label: 'Tinggi' }] : []),
  ];

  const values: Record<DimensionField, string> = { length, width, height };

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="block text-sm font-semibold text-gray-700">
          Ukuran <span className="text-gray-400 font-normal">(cm)</span>
        </span>
        <span className="text-xs text-gray-400">
          {isBox ? 'Panjang × Lebar × Tinggi' : 'Panjang × Lebar'}
        </span>
      </div>

      <div className={`grid grid-cols-1 gap-4 ${isBox ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        {fields.map(({ key, label }) => (
          <div key={key} className="space-y-1.5">
            <label htmlFor={key} className="block text-xs font-medium text-gray-500">
              {label}
              {key === 'height' && <span className="text-teal-500"> *</span>}
            </label>
            <DecimalInput
              id={key}
              value={values[key]}
              onChange={(v) => onChange(key, v ? String(v) : '')}
              suffix="cm"
              disabled={disabled}
              className={`${INPUT_CLASS} ${errors[key] ? 'border-rose-500' : 'border-gray-300 hover:border-gray-300'}`}
            />
            {errors[key] && <p className="text-rose-400 text-xs mt-1">{errors[key]}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
