'use server';

import { z } from 'zod';
import { sql } from '@vercel/postgres';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';

// スキーマ定義
const FormSchema = z.object({
  id: z.string(),
  customerId: z.string({
    invalid_type_error: '顧客を選択してください。',
  }),
  amount: z.coerce  // coerce によって文字列の場合は強制的に型変換する
          .number()
          .gt(0, { message: '0 より大きい金額を入れてください。' }),
  status: z.enum(['pending', 'paid'], {
    invalid_type_error: '請求書のタイプを選択してください。',
  }),
  date: z.string(),
});

// バリデータ
const CreateInvoice = FormSchema.omit({id: true, date: true});
const UpdateInvoice = FormSchema.omit({id: true, date: true});

// エラー状態
export type State = {
  errors?: {
    customerId?: string[];
    amount?: string[];
    status?: string[];
  };
  message?: string | null;
};

export async function createInvoice(prevState: State, formData: FormData) {
  // バリデート
  console.log('function:createInvoice:prevState', prevState);
  const validatedFields = CreateInvoice.safeParse(
    // Object.fromEntries(formData.entries())
    {
      customerId: formData.get('customerId'),
      amount: formData.get('amount'),
      status: formData.get('status'),
    }
  );
  console.log('function:createInvoice:validatedFields', validatedFields);

  // If form validation fails, return errors early.
  // Othersize, continue.
  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: '未設定の項目があります。請求書の作成に失敗しました。',
    };
  }

  // 変換
  const { customerId, amount, status } = validatedFields.data;
  const amountInCents = amount * 100;
  const date = new Date().toISOString().split('T')[0];

  // データベース挿入
  try {
    await sql`
      INSERT INTO invoices (customer_id, amount, status, date)
      VALUES (${customerId}, ${amountInCents}, ${status}, ${date})
    `;
  } catch (error) {
    return {
      message: 'Database Error: Failed to Create Invoice',
    };
  }

  // キャッシュ無効化とリダイレクト
  revalidatePath('/dashboard/invoices');
  redirect('/dashboard/invoices');
}

export async function updateInvoice(id: string, prevState: State, formData: FormData) {
  // バリデート
  const validatedFields = UpdateInvoice.safeParse(
    Object.fromEntries(formData.entries())
  );

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Update Invoice.',
    };
  }

  // 変換
  const { customerId, amount, status } = validatedFields.data;
  const amountInCents = amount * 100;

  // データベース更新
  try {
    await sql`
      UPDATE invoices
        SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
      WHERE id = ${id}
    `;
  } catch (error) {
    return { message: 'Database Error: Failed to Update Invoice.' };
  }

  // キャッシュ無効化とリダイレクト
  revalidatePath('/dashboard/invoices');
  redirect('/dashboard/invoices');
}

export async function deleteInvoice(id: string) {
  // hrow new Error('Failed to Delete Invoice');
  // データベース削除
  try {
    await sql`DELETE FROM invoices WHERE id = ${id}`;
    revalidatePath('/dashboard/invoices');
    return { message: 'Deleted Invoices.' };
  } catch (error) {
    return { message: 'Database Error: Failed to Delete Invoice.' };
  }
}

export async function authenticate(
  prevState: string | undefined,
  formData: FormData,
) {
  try {
    await signIn('credentials', formData);
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return 'ユーザー名かパスワードが間違っています。';
        default:
          return 'ユーザー認証で問題がありました。';
      }
    }
    throw error;
  }
}
