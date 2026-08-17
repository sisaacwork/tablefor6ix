import { submissionUrl } from '../submit.ts';

/**
 * In-site submission form. Posts to the site's own /api/submit Worker
 * endpoint, which files the suggestion as a GitHub issue for review. If the
 * endpoint is unavailable (local dev, or no token configured yet), the form
 * falls back to the prefilled GitHub issue link.
 */

let dialog: HTMLDialogElement | null = null;

function build(): HTMLDialogElement {
  const dlg = document.createElement('dialog');
  dlg.className = 'submit-dialog';
  dlg.setAttribute('aria-label', 'Suggest a restaurant');
  dlg.innerHTML = `
    <form method="dialog" novalidate>
      <h3>Suggest a restaurant</h3>
      <p class="dialog-sub">Every suggestion is reviewed by hand and added to the public dataset.</p>
      <label>Restaurant name
        <input name="name" required maxlength="120" autocomplete="off" />
      </label>
      <label>Country of cuisine
        <input name="country" required maxlength="120" autocomplete="off" />
      </label>
      <label>Address
        <input name="address" required maxlength="200" autocomplete="off" placeholder="Close enough that we can find it" />
      </label>
      <label>Website or social <span class="optional">(optional)</span>
        <input name="website" maxlength="200" autocomplete="off" />
      </label>
      <label>Anything else? <span class="optional">(optional)</span>
        <textarea name="notes" maxlength="1000" placeholder="What should we order?"></textarea>
      </label>
      <label class="hp" aria-hidden="true">Company
        <input name="company" tabindex="-1" autocomplete="off" />
      </label>
      <p class="dialog-status" role="status"></p>
      <div class="dialog-actions">
        <button type="button" class="cancel">Cancel</button>
        <button type="submit" class="primary">Send it</button>
      </div>
    </form>
  `;
  document.body.appendChild(dlg);

  const form = dlg.querySelector('form')!;
  const status = dlg.querySelector<HTMLElement>('.dialog-status')!;
  const sendBtn = dlg.querySelector<HTMLButtonElement>('.primary')!;
  dlg.querySelector<HTMLButtonElement>('.cancel')!.addEventListener('click', () => dlg.close());

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form)) as Record<string, string>;
    for (const field of ['name', 'country', 'address'] as const) {
      if (!data[field]?.trim()) {
        status.className = 'dialog-status error';
        status.textContent = 'Name, country, and address are the three we need.';
        return;
      }
    }
    sendBtn.disabled = true;
    status.className = 'dialog-status';
    status.textContent = 'Sending…';
    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.json();
      status.textContent = 'Sent — thank you. It goes on the map once reviewed.';
      form.querySelectorAll('input, textarea').forEach((el) => ((el as HTMLInputElement).value = ''));
      setTimeout(() => dlg.close(), 1600);
    } catch {
      status.className = 'dialog-status error';
      status.innerHTML = '';
      status.append('Could not send from here — ');
      const a = document.createElement('a');
      a.href = submissionUrl(data['country']);
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'use the GitHub form instead';
      status.append(a, '.');
    } finally {
      sendBtn.disabled = false;
    }
  });

  return dlg;
}

export function openSubmitDialog(countryName?: string): void {
  dialog ??= build();
  const status = dialog.querySelector<HTMLElement>('.dialog-status')!;
  status.className = 'dialog-status';
  status.textContent = '';
  if (countryName) {
    dialog.querySelector<HTMLInputElement>('input[name="country"]')!.value = countryName;
  }
  dialog.showModal();
  dialog.querySelector<HTMLInputElement>('input[name="name"]')!.focus();
}
