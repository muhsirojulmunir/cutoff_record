export interface BankAccountInput {
  bank_name: string;
  account_number: string;
  account_holder: string;
}

interface Props {
  accounts: BankAccountInput[];
  onChange: (accounts: BankAccountInput[]) => void;
  /** Error dari Laravel, mis. { 'bank_accounts.0.bank_name': 'wajib diisi' }. */
  errors: Record<string, string>;
  disabled?: boolean;
}

const INPUT_CLASS =
  'w-full px-4 py-2.5 rounded-xl bg-white border text-gray-800 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all';

export const emptyBankAccount = (): BankAccountInput => ({
  bank_name: '',
  account_number: '',
  account_holder: '',
});

/**
 * Daftar rekening bank pabrik — satu pabrik boleh punya banyak rekening.
 */
export default function SupplierBankAccountFields({ accounts, onChange, errors, disabled }: Props) {
  function updateRow(index: number, field: keyof BankAccountInput, value: string) {
    onChange(accounts.map((account, i) => (i === index ? { ...account, [field]: value } : account)));
  }

  function addRow() {
    onChange([...accounts, emptyBankAccount()]);
  }

  function removeRow(index: number) {
    const next = accounts.filter((_, i) => i !== index);
    onChange(next.length > 0 ? next : [emptyBankAccount()]);
  }

  return (
    <div className="space-y-3 p-4 rounded-xl bg-gray-50/50 border border-gray-300">
      <div className="flex items-center justify-between">
        <div>
          <span className="block text-sm font-semibold text-gray-700">Rekening Bank</span>
          <p className="text-xs text-gray-400 mt-0.5">Satu pabrik boleh punya lebih dari satu rekening.</p>
        </div>
        <button
          type="button"
          onClick={addRow}
          disabled={disabled}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-teal-400 hover:border-teal-500 text-teal-700 hover:bg-teal-50 text-xs font-semibold transition-all disabled:opacity-50"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Tambah Rekening
        </button>
      </div>

      {accounts.map((account, index) => {
        const bankError = errors[`bank_accounts.${index}.bank_name`];

        return (
          <div key={index} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-start">
            <div className="space-y-1">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Nama Bank <span className="text-teal-500">*</span>
              </label>
              <input
                type="text"
                value={account.bank_name}
                onChange={(e) => updateRow(index, 'bank_name', e.target.value)}
                placeholder="BCA / Mandiri / BRI"
                className={`${INPUT_CLASS} ${bankError ? 'border-rose-500' : 'border-gray-300'}`}
                disabled={disabled}
              />
              {bankError && <p className="text-rose-400 text-xs">{bankError}</p>}
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Nomor Rekening
              </label>
              <input
                type="text"
                value={account.account_number}
                onChange={(e) => updateRow(index, 'account_number', e.target.value)}
                placeholder="1234567890"
                className={`${INPUT_CLASS} border-gray-300 font-mono`}
                disabled={disabled}
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Atas Nama
              </label>
              <input
                type="text"
                value={account.account_holder}
                onChange={(e) => updateRow(index, 'account_holder', e.target.value)}
                placeholder="Nama pemilik rekening"
                className={`${INPUT_CLASS} border-gray-300`}
                disabled={disabled}
              />
            </div>

            <button
              type="button"
              onClick={() => removeRow(index)}
              disabled={disabled || (accounts.length === 1 && !account.bank_name && !account.account_number)}
              title="Hapus rekening"
              className="sm:mt-[26px] p-2.5 rounded-xl text-gray-400 hover:text-rose-500 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-all disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-400"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
