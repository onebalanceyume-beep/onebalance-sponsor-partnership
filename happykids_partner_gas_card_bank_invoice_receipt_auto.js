// ============================================================
// HAPPY KIDS PROJECT パートナー申込み GAS 差し替え用コード（請求書の自動送信＋領収書の自動送信つき）
// 貼り付け位置：GASエディタの「コード」で
//   「// ===== 請求書・メールの設定」の行から「// ===== 受付の振り分け」の行の直前まで を全部消して、これを貼る
// できること：
//  1) 口座振込＝請求書PDFを作ってそのまま申込者へ自動送信 → ヨシさんへ「送信済み」報告
//  2) カード＝Stripeリンク付きメールを自動送信（日割りなし・申込日から1年）
//  3) 申込みは「HAPPY KIDS PROJECT パートナー契約・更新管理」シートに自動で1行追加
//  4) シートの「状態」を「入金済」に変えるだけで、領収書PDFを申込者へ自動送信 → ヨシさんへ報告
//     （初回だけ hkSetupReceiptTrigger を1回実行して、領収書の自動送信をONにする）
// ============================================================

// ===== 請求書・メールの設定（変えたいときはここだけ） =====
const HK_INVOICE = {
  ISSUER_NAME: 'HAPPY KIDS PROJECT 鳥取',
  ISSUER_ADDRESS: '鳥取県米子市車尾6丁目8-59',
  ISSUER_TEL: '0859-49-5275',
  BANK_INFO: '山陰合同銀行 ／ 店番080 ／ 普通預金 ／ 口座番号 3795597 ／ 口座名義 ワンバランスボクシングジム 長尾 儀弘',
  DESCRIPTION: 'ハッピーキッズパートナーシップ年間契約として',   // 請求書の内容・領収書の但し書き
  STAMP_NOTE: '電子発行のため、収入印紙は不要です。',
  COLOR: '#DD0B1B',
  FOLDER_NAME: 'HAPPY KIDS 請求書',
  RECEIPT_FOLDER_NAME: 'HAPPY KIDS 領収書'
};

// 年額（税込）
const HK_ANNUAL = { Silver: 19800, Gold: 39600 };

// カード決済（Stripe・年額自動更新）の決済リンク
const HK_STRIPE = {
  Silver: 'https://buy.stripe.com/8x228sbe91go5vCd5zffy0f',
  Gold: 'https://buy.stripe.com/cNi4gA81X7EM3nuaXrffy0p'
};

// 管理シート（HAPPY KIDS PROJECT パートナー契約・更新管理）
const HK_MANAGE = {
  SHEET_ID: '13BOp0lg7tFE4ZpkeJspsa9fc9YkdYZeHGxLf1ZhrQc4',
  SHEET_NAME: 'パートナー契約一覧',
  TAX_LABEL: '税込'
};

// 管理シートの列番号（A=1）。O〜S列は自動追加される列
const HK_COL = { RANK: 2, NAME: 3, POSTER: 4, PAY: 5, COURSE: 6, TAX: 7, START: 8, NEXT: 9, DAYS: 10, STATUS: 11, MEMO: 13, NOTE: 14,
                 AMOUNT: 15, EMAIL: 16, INVNO: 17, INVSENT: 18, RCSENT: 19 };
const HK_EXTRA_HEADERS = ['請求金額(円)', 'メールアドレス', '請求書番号', '請求書送付', '領収書送付'];
const HK_PAID = '入金済';          // この状態にすると領収書が自動送信される
const HK_ACTIVE = '契約中';        // 領収書送付後に自動でこの状態になる

// ----- 契約年度は毎年11/1〜翌10/31。残り月数＝申込み月から10月まで（申込み月を含む） -----
function hkMonthsLeft_(today) {
  const m = today.getMonth() + 1;
  return m >= 11 ? 12 - (m - 11) : 11 - m;
}

function hkCalcMonthly_(annual, today) {
  const months = hkMonthsLeft_(today);
  const endYear = (today.getMonth() + 1) >= 11 ? today.getFullYear() + 1 : today.getFullYear();
  const end = new Date(endYear, 9, 31);
  return {
    monthly: Math.floor(annual / 12),
    months: months,
    amount: Math.floor(annual / 12) * months,
    end: end,
    nextStart: new Date(endYear, 10, 1)
  };
}

function hkFmt_(d) { return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy年M月d日'); }
function hkFmtSlash_(d) { return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy/MM/dd'); }
function hkStamp_(d) { return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm'); }
function hkYen_(n) { return '¥' + Number(n).toLocaleString('en-US'); }
function hkEsc_(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function hkJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function hkSheetUrl_() { return 'https://docs.google.com/spreadsheets/d/' + HK_MANAGE.SHEET_ID; }

// ----- 請求書・領収書の共通デザイン（赤の二重枠・中央揃えのフォーマル） -----
function hkFrame_(title, bodyHtml) {
  const c = HK_INVOICE.COLOR;
  return '<html><body style="margin:0;padding:24px;font-family:sans-serif;color:#222;">' +
    '<table style="width:100%;border:3px solid ' + c + ';border-collapse:collapse;"><tr><td style="padding:5px;">' +
    '<table style="width:100%;border:1px solid ' + c + ';border-collapse:collapse;"><tr><td style="padding:26px 30px;">' +
    '<div style="text-align:center;font-size:32px;font-weight:bold;letter-spacing:14px;color:' + c + ';">' + title + '</div>' +
    '<div style="text-align:center;font-size:11px;color:#666;margin-top:4px;letter-spacing:2px;">' + hkEsc_(HK_INVOICE.ISSUER_NAME) + '</div>' +
    '<div style="border-top:2px solid ' + c + ';margin-top:14px;"></div>' +
    bodyHtml +
    '</td></tr></table></td></tr></table></body></html>';
}

function hkIssuerHtml_() {
  return '<div style="margin-top:26px;font-size:12px;text-align:right;line-height:1.7;"><b style="font-size:14px;">' + hkEsc_(HK_INVOICE.ISSUER_NAME) + '</b><br>' +
    hkEsc_(HK_INVOICE.ISSUER_ADDRESS) + '<br>TEL ' + hkEsc_(HK_INVOICE.ISSUER_TEL) + '</div>';
}

function hkInvoiceHtml_(o) {
  const c = HK_INVOICE.COLOR;
  const body =
    '<table style="width:100%;margin-top:18px;font-size:13px;border-collapse:collapse;"><tr>' +
    '<td style="vertical-align:bottom;width:56%;"><div style="font-size:19px;font-weight:bold;border-bottom:1px solid #999;padding-bottom:4px;">' + hkEsc_(o.billTo) + ' 御中</div></td>' +
    '<td style="vertical-align:top;text-align:right;line-height:1.8;">請求書番号：' + o.invoiceNo + '<br>発行日：' + hkFmt_(o.issued) + '<br>お支払期限：' + hkFmt_(o.due) + '</td></tr></table>' +
    '<div style="margin-top:20px;font-size:13px;text-align:center;">下記の通り、ご請求申し上げます。</div>' +
    '<table style="width:100%;margin-top:10px;border-collapse:collapse;"><tr>' +
    '<td style="background:' + c + ';color:#fff;padding:14px 18px;font-size:13px;">ご請求金額</td>' +
    '<td style="background:' + c + ';color:#fff;padding:14px 18px;font-size:28px;font-weight:bold;text-align:right;">' + hkYen_(o.amount) + '<span style="font-size:13px;">（' + HK_MANAGE.TAX_LABEL + '）</span></td></tr></table>' +
    '<table style="width:100%;border-collapse:collapse;margin-top:18px;font-size:13px;">' +
    '<tr style="background:#f6f6f6;"><td style="border:1px solid #bbb;padding:8px;">内容</td><td style="border:1px solid #bbb;padding:8px;text-align:right;width:130px;">金額（' + HK_MANAGE.TAX_LABEL + '）</td></tr>' +
    '<tr><td style="border:1px solid #bbb;padding:10px;line-height:1.8;">' + hkEsc_(HK_INVOICE.DESCRIPTION) + '<br>プラン：' + hkEsc_(o.planLabel) +
    '<br>契約期間：' + hkFmt_(o.issued) + '〜' + hkFmt_(o.end) + '（月割り：' + hkYen_(o.monthly) + ' × ' + o.months + 'ヶ月）' +
    '<br>次回更新：' + hkFmt_(o.nextStart) + '（年額 ' + hkYen_(o.annual) + '）</td>' +
    '<td style="border:1px solid #bbb;padding:10px;text-align:right;vertical-align:top;">' + hkYen_(o.amount) + '</td></tr></table>' +
    '<div style="margin-top:20px;font-size:13px;line-height:1.8;"><b>お振込先</b><br>' + hkEsc_(HK_INVOICE.BANK_INFO) +
    '<br><span style="font-size:11px;color:#666;">※振込手数料はお客様のご負担でお願いいたします。</span></div>' +
    hkIssuerHtml_();
  return hkFrame_('請 求 書', body);
}

function hkReceiptHtml_(o) {
  const c = HK_INVOICE.COLOR;
  const body =
    '<table style="width:100%;margin-top:18px;font-size:13px;border-collapse:collapse;"><tr>' +
    '<td style="vertical-align:bottom;width:56%;"><div style="font-size:19px;font-weight:bold;border-bottom:1px solid #999;padding-bottom:4px;">' + hkEsc_(o.billTo) + ' 様</div></td>' +
    '<td style="vertical-align:top;text-align:right;line-height:1.8;">領収書番号：' + o.receiptNo + '<br>領収日：' + hkFmt_(o.issued) + '</td></tr></table>' +
    '<table style="width:100%;margin-top:24px;border-collapse:collapse;"><tr>' +
    '<td style="background:' + c + ';color:#fff;padding:16px 18px;font-size:13px;">領収金額</td>' +
    '<td style="background:' + c + ';color:#fff;padding:16px 18px;font-size:30px;font-weight:bold;text-align:right;">' + hkYen_(o.amount) + '<span style="font-size:13px;">（' + HK_MANAGE.TAX_LABEL + '）</span></td></tr></table>' +
    '<table style="width:100%;border-collapse:collapse;margin-top:18px;font-size:13px;">' +
    '<tr><td style="border:1px solid #bbb;background:#f6f6f6;padding:10px;width:110px;">但し書き</td><td style="border:1px solid #bbb;padding:10px;">' + hkEsc_(o.note) + '</td></tr>' +
    '<tr><td style="border:1px solid #bbb;background:#f6f6f6;padding:10px;">お支払方法</td><td style="border:1px solid #bbb;padding:10px;">' + hkEsc_(o.payLabel) + '</td></tr>' +
    '<tr><td style="border:1px solid #bbb;background:#f6f6f6;padding:10px;">プラン</td><td style="border:1px solid #bbb;padding:10px;">' + hkEsc_(o.planLabel) + '</td></tr></table>' +
    '<div style="margin-top:20px;font-size:13px;text-align:center;">上記の金額を、たしかに領収いたしました。</div>' +
    '<div style="margin-top:6px;font-size:11px;color:#666;text-align:center;">' + hkEsc_(HK_INVOICE.STAMP_NOTE) + '</div>' +
    hkIssuerHtml_();
  return hkFrame_('領 収 書', body);
}

// ----- 管理シート：見出し（O〜S列）を用意 -----
function hkEnsureHeaders_(sh) {
  if (!sh.getRange(1, HK_COL.AMOUNT).getValue()) {
    sh.getRange(1, HK_COL.AMOUNT, 1, HK_EXTRA_HEADERS.length).setValues([HK_EXTRA_HEADERS]);
  }
}

// ----- 管理シートに1行追加（A〜N列は既存の並び、O〜S列は請求・領収書の自動処理用） -----
function hkAppendManageRow_(o) {
  const ss = SpreadsheetApp.openById(HK_MANAGE.SHEET_ID);
  const sh = ss.getSheetByName(HK_MANAGE.SHEET_NAME);
  if (!sh) return;
  hkEnsureHeaders_(sh);
  const last = sh.getLastRow();
  const row = last + 1;
  sh.getRange(row, 1, 1, 19).setValues([[
    '',
    o.planKey === 'Gold' ? 'SPECIAL' : 'PARTNER',
    o.company,
    '○',
    o.payMethod === 'card' ? 'Stripe' : '振込',
    hkYen_(o.annual).replace('¥', '') + '円',
    HK_MANAGE.TAX_LABEL,
    hkFmtSlash_(o.start),
    hkFmtSlash_(o.nextStart),
    '',
    o.status,
    '',
    o.memo,
    'ご担当：' + o.person + ' ／ ' + o.email + ' ／ ' + o.tel + ' ／ ' + o.address,
    o.amount,
    o.email,
    o.invoiceNo || '',
    o.invoiceSent || '',
    ''
  ]]);
  // 「更新まで日数」の数式は1つ上の行からコピー
  if (last >= 2) sh.getRange(last, HK_COL.DAYS).copyTo(sh.getRange(row, HK_COL.DAYS));
}

function hkSaveToDrive_(folderName, pdf) {
  const folders = DriveApp.getFoldersByName(folderName);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
  return folder.createFile(pdf);
}

// ============ 申込みの受付（ページから呼ばれる） ============
function hkPartnerPost_(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const data = JSON.parse(e.postData.contents);
    const person = (data.name || '').toString().trim();
    const planKey = (data.planKey || '').toString().trim();
    const payMethod = (data.payMethod || '').toString().trim();   // 'card' or 'bank'
    const email = (data.email || '').toString().trim();
    const tel = (data.tel || '').toString().trim();
    const address = (data.address || '').toString().trim();
    const kana = (data.kana || '').toString().trim();
    const companyName = (data.companyName || '').toString().trim();
    const companyDisplay = companyName !== '' ? companyName : '個人でのお申し込み';
    const billTo = companyName !== '' ? companyName : person;

    if (!person) return hkJson_({ result: 'error', message: 'name required' });
    if (!HK_ANNUAL[planKey]) return hkJson_({ result: 'error', message: 'invalid plan' });
    if (payMethod !== 'card' && payMethod !== 'bank') return hkJson_({ result: 'error', message: 'invalid payMethod' });

    const annual = HK_ANNUAL[planKey];
    const now = new Date();
    const planLabel = planKey + '（' + hkYen_(annual) + '／年）';
    const owner = HK_INVOICE.ISSUER_NAME;
    const lineUrl = HK_CONFIG.HK_LINE_URL;

    // ============ カード決済 ============
    if (payMethod === 'card') {
      const nextStart = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
      hkAppendManageRow_({
        planKey: planKey, company: companyDisplay, payMethod: 'card', annual: annual, amount: annual,
        start: now, nextStart: nextStart, status: 'カード決済待ち',
        memo: 'カード（年額自動更新・日割りなし）。Stripeで決済を確認したら状態を「入金済」にすると領収書が自動送信されます',
        person: person, email: email, tel: tel, address: address,
        invoiceNo: '', invoiceSent: '（カードのため請求書なし）'
      });
      if (email) {
        MailApp.sendEmail({
          to: email,
          subject: '【' + owner + '】パートナーお申し込みありがとうございます（カード決済）',
          body: person + ' 様\n\nこのたびはHAPPY KIDS PROJECT パートナーシップにお申し込みいただき、誠にありがとうございます。\n\n' +
            '・プラン：' + planLabel + '\n・会社名：' + companyDisplay + '\n・お支払い：クレジットカード（年額・自動更新）\n' +
            '・契約期間：お支払い日から1年間（日割りなし）\n\n' +
            '以下のリンクよりカードでのお支払いをお願いいたします。\n' + HK_STRIPE[planKey] + '\n\n' +
            'ご不明な点は、公式LINEよりお気軽にご連絡ください。\n' + lineUrl + '\n\n' + owner
        });
      }
      MailApp.sendEmail({
        to: HK_CONFIG.OWNER_EMAIL,
        subject: '【新規申込・カード】HAPPY KIDS PROJECT パートナー - ' + companyDisplay,
        body: '・プラン：' + planLabel + '\n・支払方法：カード（Stripeで決済を確認してください）\n・会社名：' + companyDisplay +
          '\n・カタカナ読み：' + kana + '\n・ご担当者様：' + person + '\n・ご住所：' + address + '\n・メール：' + email + '\n・電話：' + tel +
          '\n\n決済を確認したら、管理シートの「状態」を「入金済」にしてください（領収書が自動で送られます）。\n' + hkSheetUrl_()
      });
      return hkJson_({ result: 'success', payMethod: 'card' });
    }

    // ============ 口座振込（月割り・請求書を自動送信） ============
    const pr = hkCalcMonthly_(annual, now);
    const due = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());   // 1ヶ月以内
    const plan = planKey + '（' + hkYen_(annual) + '／年）';

    let invoiceNo = 'HK-' + Utilities.formatDate(now, 'Asia/Tokyo', 'yyyyMMdd') + '-' + Utilities.formatDate(now, 'Asia/Tokyo', 'HHmm');

    // 経費連動DB（既存の記録先）
    const hSs = SpreadsheetApp.openById(HK_CONFIG.EXPENSE_DB_SHEET_ID);
    const hSheet = hSs.getSheetByName(HK_CONFIG.EXPENSE_DB_SHEET_NAME);
    if (hSheet) {
      const lastRow = hSheet.getLastRow();
      let targetRow = null;
      for (let r = 3; r <= lastRow; r++) {
        if (!hSheet.getRange(r, 2).getValue()) { targetRow = r; break; }
      }
      if (!targetRow) targetRow = lastRow + 1;
      const noCell = hSheet.getRange(targetRow, 1).getValue();
      let nextNo;
      if (typeof noCell === 'number' && noCell > 0) {
        nextNo = noCell;
      } else {
        const prevNo = targetRow > 3 ? hSheet.getRange(targetRow - 1, 1).getValue() : 0;
        nextNo = (typeof prevNo === 'number' ? prevNo : 0) + 1;
      }
      hSheet.getRange(targetRow, 1, 1, 7).setValues([[nextNo, billTo, plan, pr.amount, now, pr.nextStart, '請求書（振込）']]);
      invoiceNo = 'HK-' + Utilities.formatDate(now, 'Asia/Tokyo', 'yyyyMMdd') + '-' + ('0' + nextNo).slice(-2);
    }

    // 請求書PDF → Driveに保存 → 申込者へ自動送信 → ヨシさんへ報告
    let sentText = '';
    let ownerReport = '';
    let pdf = null;
    try {
      const html = hkInvoiceHtml_({
        billTo: billTo, invoiceNo: invoiceNo, issued: now, due: due, amount: pr.amount,
        planLabel: plan, end: pr.end, nextStart: pr.nextStart, months: pr.months, monthly: pr.monthly, annual: annual
      });
      pdf = Utilities.newBlob(html, 'text/html', 'x').getAs('application/pdf').setName('請求書_' + invoiceNo + '_' + billTo + '.pdf');
      const file = hkSaveToDrive_(HK_INVOICE.FOLDER_NAME, pdf);
      const subject = '【' + owner + '】パートナーシップ年間契約 請求書のご送付';
      const body = billTo + ' 様\n\nこのたびはHAPPY KIDS PROJECT パートナーシップにお申し込みいただき、誠にありがとうございます。\n' +
        '請求書を添付いたしますので、お支払期限（' + hkFmt_(due) + '）までに、請求書記載の口座へお振込みをお願いいたします。\n\n' +
        '【お申し込み内容】\n・プラン：' + plan + '\n・会社名：' + companyDisplay + '\n・カタカナ読み：' + kana + '\n・ご担当者様：' + person +
        '\n・ご住所：' + address + '\n・電話番号：' + tel + '\n\n' +
        'ご請求金額：' + hkYen_(pr.amount) + '（' + HK_MANAGE.TAX_LABEL + '）\n契約期間：' + hkFmt_(now) + '〜' + hkFmt_(pr.end) + '（月割り' + pr.months + 'ヶ月）\n' +
        'お支払期限：' + hkFmt_(due) + '\n次回更新：' + hkFmt_(pr.nextStart) + '\n\n' +
        'ご不明な点は、公式LINEよりお気軽にご連絡ください。\n' + lineUrl + '\n\n' + owner;
      if (email) {
        try {
          GmailApp.sendEmail(email, subject, body, { attachments: [pdf], name: owner });
          sentText = '送付済 ' + hkStamp_(new Date());
          ownerReport = '請求書を申込者へ送信しました。\n送信先：' + email;
        } catch (sendErr) {
          GmailApp.createDraft(email, subject, body, { attachments: [pdf], name: owner });
          sentText = '下書き（送信失敗）';
          ownerReport = '※送信に失敗したため、Gmailの下書きに入れました。内容を確認して送信してください。\n理由：' + sendErr.message;
        }
      } else {
        sentText = 'メールなし';
        ownerReport = '※メールアドレスがないため送信していません。PDFを確認して手動で送ってください。';
      }
      ownerReport += '\n請求書PDF：' + file.getUrl();
    } catch (invErr) {
      sentText = '作成失敗';
      ownerReport = '※請求書の作成に失敗しました。手動で作成してください。\n理由：' + invErr.message;
    }

    // 管理シートに追加
    hkAppendManageRow_({
      planKey: planKey, company: companyDisplay, payMethod: 'bank', annual: annual, amount: pr.amount,
      start: now, nextStart: pr.nextStart, status: '請求書送付済・入金待ち',
      memo: '振込（' + hkFmtSlash_(now) + '〜' + hkFmtSlash_(pr.end) + ' 月割り' + pr.months + 'ヶ月 ' + hkYen_(pr.amount) + '）。期限：' + hkFmtSlash_(due) + '。入金を確認したら状態を「入金済」にすると領収書が自動送信されます',
      person: person, email: email, tel: tel, address: address,
      invoiceNo: invoiceNo, invoiceSent: sentText
    });

    // ヨシさんへの報告（送信した請求書のPDFつき）
    const reportMail = {
      to: HK_CONFIG.OWNER_EMAIL,
      subject: '【請求書 ' + (sentText.indexOf('送付済') === 0 ? '送信済み' : '要確認') + '】HAPPY KIDS PROJECT パートナー - ' + companyDisplay + '（' + hkYen_(pr.amount) + '）',
      body: ownerReport + '\n\n・プラン：' + plan + '\n・今回の請求額：' + hkYen_(pr.amount) + '（月割り' + pr.months + 'ヶ月）\n・お支払期限：' + hkFmt_(due) +
        '\n・会社名：' + companyDisplay + '\n・カタカナ読み：' + kana + '\n・ご担当者様：' + person + '\n・ご住所：' + address +
        '\n・メール：' + email + '\n・電話：' + tel + '\n\n入金を確認したら、管理シートの「状態」を「入金済」にしてください（領収書が自動で送られます）。\n' + hkSheetUrl_()
    };
    if (pdf) reportMail.attachments = [pdf];
    MailApp.sendEmail(reportMail);

    return hkJson_({ result: 'success', payMethod: 'bank', amount: pr.amount, months: pr.months });

  } catch (err) {
    return hkJson_({ result: 'error', message: err.message });
  } finally {
    lock.releaseLock();
  }
}

// ============ 領収書の自動送信 ============
// 初回だけ、GASエディタでこの関数を選んで「実行」を1回押す（権限の承認が出たら許可）
function hkSetupReceiptTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'hkOnEditReceipt') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('hkOnEditReceipt').forSpreadsheet(HK_MANAGE.SHEET_ID).onEdit().create();
  const sh = SpreadsheetApp.openById(HK_MANAGE.SHEET_ID).getSheetByName(HK_MANAGE.SHEET_NAME);
  if (sh) hkEnsureHeaders_(sh);
}

// 管理シートの「状態」が編集されたとき自動で動く（「入金済」にした行に領収書を送る）
function hkOnEditReceipt(e) {
  if (!e || !e.range) return;
  const sh = e.range.getSheet();
  if (sh.getName() !== HK_MANAGE.SHEET_NAME) return;
  const c1 = e.range.getColumn();
  const c2 = c1 + e.range.getNumColumns() - 1;
  if (HK_COL.STATUS < c1 || HK_COL.STATUS > c2) return;
  const r1 = Math.max(e.range.getRow(), 2);
  const r2 = Math.min(e.range.getRow() + e.range.getNumRows() - 1, r1 + 49);
  for (let r = r1; r <= r2; r++) hkIssueReceiptForRow_(sh, r);
}

function hkIssueReceiptForRow_(sh, r) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const v = sh.getRange(r, 1, 1, 19).getValues()[0];
    if (String(v[HK_COL.STATUS - 1]).trim() !== HK_PAID) return;
    if (String(v[HK_COL.RCSENT - 1]).indexOf('送付済') === 0) return;   // 二重送信を防ぐ

    const billTo = String(v[HK_COL.NAME - 1]).trim();
    const email = String(v[HK_COL.EMAIL - 1]).trim();
    const amount = Number(v[HK_COL.AMOUNT - 1]);
    const payLabel = String(v[HK_COL.PAY - 1]).indexOf('Stripe') >= 0 ? 'クレジットカード' : '銀行振込';
    const rankText = String(v[HK_COL.RANK - 1]).trim();
    const planName = rankText === 'SPECIAL' ? 'Gold' : (rankText === 'PARTNER' ? 'Silver' : rankText);   // シートのランク表記 → プラン名
    const planLabel = planName + '（年額 ' + String(v[HK_COL.COURSE - 1]).trim() + '）';
    const owner = HK_INVOICE.ISSUER_NAME;
    const now = new Date();

    if (!email || !amount) {
      sh.getRange(r, HK_COL.RCSENT).setValue('要手動対応（メール or 金額が空）');
      MailApp.sendEmail({
        to: HK_CONFIG.OWNER_EMAIL,
        subject: '【領収書 要確認】' + billTo + '：メールアドレスか請求金額が空のため送れませんでした',
        body: '管理シートの ' + r + ' 行目（' + billTo + '）は、P列（メールアドレス）かO列（請求金額）が空のため、領収書を自動送信できませんでした。\n入力すると、状態を「入金済」にし直した時に送られます。\n' + hkSheetUrl_()
      });
      return;
    }

    const receiptNo = 'RC-' + Utilities.formatDate(now, 'Asia/Tokyo', 'yyyyMMdd') + '-' + ('00' + r).slice(-3);
    const html = hkReceiptHtml_({
      billTo: billTo, receiptNo: receiptNo, issued: now, amount: amount, note: HK_INVOICE.DESCRIPTION, payLabel: payLabel, planLabel: planLabel
    });
    const pdf = Utilities.newBlob(html, 'text/html', 'x').getAs('application/pdf').setName('領収書_' + receiptNo + '_' + billTo + '.pdf');
    const file = hkSaveToDrive_(HK_INVOICE.RECEIPT_FOLDER_NAME, pdf);
    const subject = '【' + owner + '】領収書のご送付';
    const body = billTo + ' 様\n\nこのたびはHAPPY KIDS PROJECT パートナーシップへのお支払いを、誠にありがとうございます。\n' +
      'ご入金を確認しましたので、領収書を添付いたします。\n\n' +
      '・領収金額：' + hkYen_(amount) + '（' + HK_MANAGE.TAX_LABEL + '）\n・但し書き：' + HK_INVOICE.DESCRIPTION + '\n・お支払方法：' + payLabel + '\n・領収書番号：' + receiptNo +
      '\n\nご不明な点は、公式LINEよりお気軽にご連絡ください。\n' + HK_CONFIG.HK_LINE_URL + '\n\n' + owner;

    try {
      GmailApp.sendEmail(email, subject, body, { attachments: [pdf], name: owner });
      sh.getRange(r, HK_COL.RCSENT).setValue('送付済 ' + hkStamp_(new Date()) + '（' + receiptNo + '）');
      sh.getRange(r, HK_COL.STATUS).setValue(HK_ACTIVE);
      MailApp.sendEmail({
        to: HK_CONFIG.OWNER_EMAIL,
        subject: '【領収書 送信済み】' + billTo + '（' + hkYen_(amount) + '）',
        body: '領収書を申込者へ送信しました。\n送信先：' + email + '\n領収書番号：' + receiptNo + '\nお支払方法：' + payLabel + '\n領収書PDF：' + file.getUrl() + '\n\n管理シートの状態は「' + HK_ACTIVE + '」に変更しました。\n' + hkSheetUrl_(),
        attachments: [pdf]
      });
    } catch (sendErr) {
      sh.getRange(r, HK_COL.RCSENT).setValue('送信失敗：' + sendErr.message);
      MailApp.sendEmail({
        to: HK_CONFIG.OWNER_EMAIL,
        subject: '【領収書 送信失敗】' + billTo,
        body: '領収書を送れませんでした。\n理由：' + sendErr.message + '\nPDF：' + file.getUrl() + '\n' + hkSheetUrl_()
      });
    }
  } finally {
    lock.releaseLock();
  }
}

