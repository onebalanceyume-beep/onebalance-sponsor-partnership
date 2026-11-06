// ============================================================
// HAPPY KIDS PROJECT パートナー申込み（カード／口座振込 選択版）GAS 差し替え用コード
// 貼り付け位置：GASエディタで「// ===== 請求書・メールの設定」の行から
//               「// ===== 受付の振り分け」の行の直前までを全部消して、これを貼る
// 変更点：
//  1) 支払方法（card=カード / bank=口座振込）で処理を分ける
//  2) 口座振込＝契約年度（11/1〜10/31）の10月末までを「月割り」（年額÷12×残り月数）
//  3) 支払期限＝請求書発行日から1ヶ月以内
//  4) 申込みを「HAPPY KIDS PROJECT パートナー契約・更新管理」シートに自動で1行追加
//  5) カード＝日割りなし・申込日から1年更新（Stripeの年額自動更新リンクへ）
// ============================================================

// ===== 請求書・メールの設定（変えたいときはここだけ） =====
const HK_INVOICE = {
  ISSUER_NAME: 'HAPPY KIDS PROJECT 鳥取',
  ISSUER_ADDRESS: '鳥取県米子市車尾6丁目8-59',
  ISSUER_TEL: '0859-49-5275',
  BANK_INFO: '山陰合同銀行 ／ 店番080 ／ 普通預金 ／ 口座番号 3795597 ／ 口座名義 ワンバランスボクシングジム 長尾 儀弘',
  DESCRIPTION: 'ハッピーキッズパートナーシップ年間契約として',
  COLOR: '#DD0B1B',
  FOLDER_NAME: 'HAPPY KIDS 請求書'
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
function hkYen_(n) { return '¥' + Number(n).toLocaleString('en-US'); }
function hkEsc_(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function hkJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function hkInvoiceHtml_(o) {
  const c = HK_INVOICE.COLOR;
  return '<html><body style="font-family:sans-serif;color:#222;padding:30px;">' +
    '<div style="border:3px solid ' + c + ';padding:28px;">' +
    '<div style="font-size:26px;font-weight:bold;text-align:center;border-bottom:4px solid ' + c + ';padding-bottom:10px;">請 求 書</div>' +
    '<table style="width:100%;margin-top:18px;font-size:13px;"><tr>' +
    '<td style="vertical-align:top;width:55%;"><div style="font-size:18px;font-weight:bold;border-bottom:1px solid #999;padding-bottom:4px;">' + hkEsc_(o.billTo) + ' 御中</div></td>' +
    '<td style="vertical-align:top;text-align:right;">請求書番号：' + o.invoiceNo + '<br>発行日：' + hkFmt_(o.issued) + '<br>お支払期限：' + hkFmt_(o.due) + '</td></tr></table>' +
    '<div style="margin-top:22px;font-size:13px;">下記の通り、ご請求申し上げます。</div>' +
    '<div style="margin-top:10px;background:' + c + ';color:#fff;padding:12px 16px;font-size:20px;font-weight:bold;">ご請求金額　' + hkYen_(o.amount) + '（' + HK_MANAGE.TAX_LABEL + '）</div>' +
    '<table style="width:100%;border-collapse:collapse;margin-top:18px;font-size:13px;">' +
    '<tr style="background:#f6f6f6;"><td style="border:1px solid #bbb;padding:8px;">内容</td><td style="border:1px solid #bbb;padding:8px;text-align:right;">金額（' + HK_MANAGE.TAX_LABEL + '）</td></tr>' +
    '<tr><td style="border:1px solid #bbb;padding:10px;">' + hkEsc_(HK_INVOICE.DESCRIPTION) + '<br>プラン：' + hkEsc_(o.planLabel) +
    '<br>契約期間：' + hkFmt_(o.issued) + '〜' + hkFmt_(o.end) + '（月割り：' + hkYen_(o.monthly) + ' × ' + o.months + 'ヶ月）' +
    '<br>次回更新：' + hkFmt_(o.nextStart) + '（年額 ' + hkYen_(o.annual) + '）</td>' +
    '<td style="border:1px solid #bbb;padding:10px;text-align:right;">' + hkYen_(o.amount) + '</td></tr></table>' +
    '<div style="margin-top:20px;font-size:13px;"><b>お振込先</b><br>' + hkEsc_(HK_INVOICE.BANK_INFO) +
    '<br><span style="font-size:11px;color:#666;">※振込手数料はお客様のご負担でお願いいたします。</span></div>' +
    '<div style="margin-top:22px;font-size:12px;text-align:right;"><b>' + hkEsc_(HK_INVOICE.ISSUER_NAME) + '</b><br>' + hkEsc_(HK_INVOICE.ISSUER_ADDRESS) + '<br>TEL ' + hkEsc_(HK_INVOICE.ISSUER_TEL) + '</div>' +
    '</div></body></html>';
}

// ----- 管理シートに1行追加（列：管理ID/ランク/会社名・名義/ポスター掲載/支払方法/契約コース/税区分/契約日/次回更新日/更新まで日数/状態/Stripe顧客ID/メモ/備考） -----
function hkAppendManageRow_(o) {
  const ss = SpreadsheetApp.openById(HK_MANAGE.SHEET_ID);
  const sh = ss.getSheetByName(HK_MANAGE.SHEET_NAME);
  if (!sh) return;
  const last = sh.getLastRow();
  const row = last + 1;
  sh.getRange(row, 1, 1, 14).setValues([[
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
    'ご担当：' + o.person + ' ／ ' + o.email + ' ／ ' + o.tel + ' ／ ' + o.address
  ]]);
  // 「更新まで日数」の数式は1つ上の行からコピー
  if (last >= 2) sh.getRange(last, 10).copyTo(sh.getRange(row, 10));
}

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
        planKey: planKey, company: companyDisplay, payMethod: 'card', annual: annual,
        start: now, nextStart: nextStart, status: 'カード決済待ち',
        memo: 'カード（年額自動更新・日割りなし）。Stripeで決済完了後に「契約中」へ変更',
        person: person, email: email, tel: tel, address: address
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
          '\n・カタカナ読み：' + kana + '\n・ご担当者様：' + person + '\n・ご住所：' + address + '\n・メール：' + email + '\n・電話：' + tel
      });
      return hkJson_({ result: 'success', payMethod: 'card' });
    }

    // ============ 口座振込（月割り・請求書） ============
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

    // 管理シートに追加
    hkAppendManageRow_({
      planKey: planKey, company: companyDisplay, payMethod: 'bank', annual: annual,
      start: now, nextStart: pr.nextStart, status: '請求書発行済・入金待ち',
      memo: '振込（' + hkFmtSlash_(now) + '〜' + hkFmtSlash_(pr.end) + ' 月割り' + pr.months + 'ヶ月 ' + hkYen_(pr.amount) + '）。期限：' + hkFmtSlash_(due) + '。請求書番号：' + invoiceNo,
      person: person, email: email, tel: tel, address: address
    });

    // 請求書PDF → Driveに保存 → Gmailに下書き（送信はヨシさんが確認して押す）
    let invoiceStatus = '';
    try {
      const html = hkInvoiceHtml_({
        billTo: billTo, invoiceNo: invoiceNo, issued: now, due: due, amount: pr.amount,
        planLabel: plan, end: pr.end, nextStart: pr.nextStart, months: pr.months, monthly: pr.monthly, annual: annual
      });
      const pdf = Utilities.newBlob(html, 'text/html', 'x').getAs('application/pdf').setName('請求書_' + invoiceNo + '_' + billTo + '.pdf');
      const folders = DriveApp.getFoldersByName(HK_INVOICE.FOLDER_NAME);
      const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(HK_INVOICE.FOLDER_NAME);
      const file = folder.createFile(pdf);
      if (email) {
        GmailApp.createDraft(
          email,
          '【' + owner + '】パートナーシップ年間契約 請求書のご送付',
          billTo + ' 様\n\nこの度はHAPPY KIDS PROJECTパートナーにお申し込みいただき、誠にありがとうございます。\n' +
          '請求書をお送りいたしますので、お支払期限（' + hkFmt_(due) + '）までに、請求書記載の口座へお振込みをお願いいたします。\n\n' +
          'ご請求金額：' + hkYen_(pr.amount) + '（' + HK_MANAGE.TAX_LABEL + '）\n' +
          '契約期間：' + hkFmt_(now) + '〜' + hkFmt_(pr.end) + '（月割り ' + pr.months + 'ヶ月）\n次回更新：' + hkFmt_(pr.nextStart) + '\n\n' +
          'ご不明な点は、公式LINEよりお気軽にご連絡ください。\n' + lineUrl + '\n\n' + owner,
          { attachments: [pdf], name: owner }
        );
      }
      invoiceStatus = '請求書PDFを作成し、Gmailの下書きに入れました。\nPDF：' + file.getUrl();
    } catch (invErr) {
      invoiceStatus = '※請求書の作成に失敗しました。手動で作成してください。\n理由：' + invErr.message;
    }

    // 申込者への完了メール
    if (email) {
      MailApp.sendEmail({
        to: email,
        subject: '【' + owner + '】HAPPY KIDS PROJECT パートナー お申し込みありがとうございます（口座振込）',
        body: person + ' 様\n\nこのたびはHAPPY KIDS PROJECT パートナーシップにお申し込みいただき、誠にありがとうございます。\n\n' +
          '【お申し込み内容】\n・プラン：' + plan + '\n・会社名：' + companyDisplay + '\n・カタカナ読み：' + kana + '\n・ご担当者様：' + person +
          '\n・ご住所：' + address + '\n・電話番号：' + tel + '\n\n' +
          '契約期間：' + hkFmt_(now) + '〜' + hkFmt_(pr.end) + '（月割り' + pr.months + 'ヶ月）\n今回のご請求額：' + hkYen_(pr.amount) + '（' + HK_MANAGE.TAX_LABEL + '）\n' +
          'お支払期限：' + hkFmt_(due) + '\n次回更新：' + hkFmt_(pr.nextStart) + '\n\n' +
          '請求書は、担当より改めてメールでお送りします。\nご不明な点は、公式LINEよりお気軽にご連絡ください。\n' + lineUrl + '\n\n' + owner
      });
    }

    // ヨシさんへの通知
    MailApp.sendEmail({
      to: HK_CONFIG.OWNER_EMAIL,
      subject: '【新規申込・振込】HAPPY KIDS PROJECT パートナー - ' + companyDisplay,
      body: '・プラン：' + plan + '\n・今回の請求額：' + hkYen_(pr.amount) + '（月割り' + pr.months + 'ヶ月）\n・お支払期限：' + hkFmt_(due) +
        '\n・会社名：' + companyDisplay + '\n・カタカナ読み：' + kana + '\n・ご担当者様：' + person + '\n・ご住所：' + address +
        '\n・メール：' + email + '\n・電話：' + tel + '\n\n' + invoiceStatus
    });

    return hkJson_({ result: 'success', payMethod: 'bank', amount: pr.amount, months: pr.months });

  } catch (err) {
    return hkJson_({ result: 'error', message: err.message });
  } finally {
    lock.releaseLock();
  }
}

