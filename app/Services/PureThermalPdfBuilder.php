<?php

namespace App\Services;

class PureThermalPdfBuilder
{
    private const CODE39_PATTERNS = [
        '0' => '000110100', '1' => '100100001', '2' => '001100001', '3' => '101100000',
        '4' => '000110001', '5' => '100110000', '6' => '001110000', '7' => '000100101',
        '8' => '100100100', '9' => '001100100', 'A' => '100001001', 'B' => '001001001',
        'C' => '101001000', 'D' => '000011001', 'E' => '100011000', 'F' => '001011000',
        'G' => '000001101', 'H' => '100001100', 'I' => '001001100', 'J' => '000011100',
        'K' => '100000011', 'L' => '001000011', 'M' => '101000010', 'N' => '000010011',
        'O' => '100010010', 'P' => '001010010', 'Q' => '000000111', 'R' => '100000110',
        'S' => '001000110', 'T' => '000010110', 'U' => '110000001', 'V' => '011000001',
        'W' => '111000000', 'X' => '010010001', 'Y' => '110010000', 'Z' => '011010000',
        '-' => '010000101', '.' => '110000100', ' ' => '011000100', '$' => '010101000',
        '/' => '010100010', '+' => '010001010', '%' => '000101010', '*' => '010010100',
    ];

    private static function escapePdfText(string $text): string
    {
        $text = str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], $text);
        return preg_replace('/[^\x20-\x7E]/', '', $text) ?? '';
    }

    private static function text(float $x, float $y, string $font, float $size, string $str): string
    {
        return "BT /" . $font . " " . $size . " Tf " . sprintf("%.2f %.2f", $x, $y) . " Td (" . self::escapePdfText($str) . ") Tj ET\n";
    }

    public static function wrapText(string $text, int $maxChars): array
    {
        $clean = trim($text);
        if ($clean === '') {
            return [];
        }
        $words = explode(' ', $clean);
        $lines = [];
        $current = '';
        foreach ($words as $w) {
            if ($w === '') {
                continue;
            }
            if ($current === '') {
                $current = $w;
            } elseif (strlen($current) + 1 + strlen($w) <= $maxChars) {
                $current .= ' ' . $w;
            } else {
                $lines[] = $current;
                $current = $w;
            }
        }
        if ($current !== '') {
            $lines[] = $current;
        }
        return $lines;
    }

    private static function drawBarcode(string $code, float $centerX, float $bottomY, float $height, float $narrowWidth = 0.95, float $wideRatio = 2.2): string
    {
        $code = strtoupper(preg_replace('/[^A-Z0-9\-\. \$\/\+\%]/', '', $code));
        if ($code === '') {
            $code = 'WAYBILL';
        }
        $full = '*' . $code . '*';
        $wideWidth = $narrowWidth * $wideRatio;
        $gap = $narrowWidth * 1.2;

        $totalWidth = 0;
        for ($i = 0; $i < strlen($full); $i++) {
            $c = $full[$i];
            $pattern = self::CODE39_PATTERNS[$c] ?? self::CODE39_PATTERNS['-'];
            for ($b = 0; $b < 9; $b++) {
                $isWide = $pattern[$b] === '1';
                $totalWidth += $isWide ? $wideWidth : $narrowWidth;
            }
            if ($i < strlen($full) - 1) {
                $totalWidth += $gap;
            }
        }

        $maxWidth = 240.0;
        if ($totalWidth > $maxWidth && $totalWidth > 0) {
            $scale = $maxWidth / $totalWidth;
            $narrowWidth *= $scale;
            $wideWidth *= $scale;
            $gap *= $scale;
            $totalWidth = $maxWidth;
        }

        $startX = $centerX - ($totalWidth / 2.0);
        $currX = $startX;
        $stream = "0 0 0 rg 0 0 0 RG\n";

        for ($i = 0; $i < strlen($full); $i++) {
            $c = $full[$i];
            $pattern = self::CODE39_PATTERNS[$c] ?? self::CODE39_PATTERNS['-'];
            for ($b = 0; $b < 9; $b++) {
                $isBar = ($b % 2) === 0;
                $isWide = $pattern[$b] === '1';
                $barW = $isWide ? $wideWidth : $narrowWidth;
                if ($isBar) {
                    $stream .= sprintf("%.2f %.2f %.2f %.2f re f\n", $currX, $bottomY, $barW, $height);
                }
                $currX += $barW;
            }
            $currX += $gap;
        }

        return $stream;
    }

    public static function buildPageStream(object $order): string
    {
        $carrier = strtoupper($order->shipping_carrier ?: 'J&T EXPRESS');
        $tracking = strtoupper($order->tracking_number ?: ($order->order_sn ?? 'NO-RESI'));
        $orderSn = $order->order_sn ?? '-';
        $isCod = ! empty($order->is_cod);

        $recipient = $order->recipient_data ?? [];
        if (is_string($recipient)) {
            $decoded = json_decode($recipient, true);
            $recipient = is_array($decoded) ? $decoded : [];
        } elseif (! is_array($recipient)) {
            $recipient = [];
        }
        $recName = ! empty($recipient['name']) ? $recipient['name'] : (! empty($order->buyer_username) ? $order->buyer_username : 'Pelanggan');
        $recPhone = ! empty($recipient['phone']) ? $recipient['phone'] : '-';
        $recAddr = ! empty($recipient['full_address']) ? $recipient['full_address'] : (! empty($order->shipping_address) ? $order->shipping_address : '-');

        $items = $order->items_json ?? [];
        if (is_string($items)) {
            $decoded = json_decode($items, true);
            $items = is_array($decoded) ? $decoded : [];
        } elseif (! is_array($items)) {
            $items = [];
        }

        $s = "0 0 0 RG 0 0 0 rg\n";

        // 1. Kotak Luar Label (Margin 4mm = 11 pt, Width: 261.46, Height: 403.20)
        $s .= "0.75 w\n";
        $s .= "11.00 11.00 261.46 403.20 re S\n";

        // 2. Header Area: Divider di y = 372
        $s .= "11.00 372.00 m 272.46 372.00 l S\n";

        // Brand & Subtitle
        $s .= self::text(18.00, 396.00, 'F2', 13.0, 'Thermal Waybill');
        $s .= self::text(18.00, 382.00, 'F1', 8.5, 'Record Shoes Official');

        // Kurir (Kanan atas)
        $s .= self::text(160.00, 396.00, 'F2', 12.0, substr($carrier, 0, 16));

        // Badge COD / NON-COD
        $codText = $isCod ? "COD" : "NON-COD";
        $codW = $isCod ? 38.0 : 54.0;
        $codX = 272.46 - 8.0 - $codW;
        $s .= sprintf("%.2f 378.00 %.2f 14.00 re S\n", $codX, $codW);
        $s .= self::text($codX + 5.0, 382.00, 'F2', 8.5, $codText);

        // 3. Barcode Box (y: 300 to 366)
        $s .= "0.5 w [2 2] 0 d\n";
        $s .= "16.00 300.00 251.46 66.00 re S\n";
        $s .= "[] 0 d 0.75 w\n";

        // Draw Barcode Vektor
        $barcodeHeight = 32.0;
        $barcodeBottomY = 324.0;
        $s .= self::drawBarcode($tracking, 141.73, $barcodeBottomY, $barcodeHeight, 0.95);

        // Teks Nomor Resi di bawah Barcode
        $s .= self::text(70.00, 308.00, 'F2', 11.0, $tracking);

        // 4. Meta Area (PENERIMA & PENGIRIM) y: 195 to 295
        $s .= "11.00 295.00 m 272.46 295.00 l S\n";
        $s .= "11.00 195.00 m 272.46 195.00 l S\n";
        $s .= "150.00 195.00 m 150.00 295.00 l S\n";

        // Data Penerima (Kiri)
        $s .= self::text(16.00, 282.00, 'F2', 8.5, 'PENERIMA:');
        $s .= self::text(16.00, 271.00, 'F2', 8.5, substr($recName, 0, 24));
        $s .= self::text(16.00, 260.00, 'F1', 7.5, 'Telp: ' . substr($recPhone, 0, 20));

        $addrLines = self::wrapText($recAddr, 28);
        $addrY = 249.00;
        $maxAddrLines = min(4, count($addrLines));
        for ($i = 0; $i < $maxAddrLines; $i++) {
            $s .= self::text(16.00, $addrY, 'F1', 7.0, $addrLines[$i]);
            $addrY -= 9.0;
        }

        // Data Pengirim (Kanan)
        $s .= self::text(155.00, 282.00, 'F2', 8.5, 'PENGIRIM:');
        $s .= self::text(155.00, 271.00, 'F2', 8.0, 'Record Shoes Official');
        $s .= self::text(155.00, 260.00, 'F1', 7.5, 'Telp: 0812-3456-7890');
        $s .= self::text(155.00, 249.00, 'F1', 7.5, 'Kab. Bogor, Jawa Barat');
        $s .= self::text(155.00, 235.00, 'F2', 7.5, 'No. Pesanan:');
        $s .= self::text(155.00, 224.00, 'F1', 7.5, substr($orderSn, 0, 22));

        // 5. Tabel Produk Pesanan (y: 35 to 195)
        $s .= "0.5 w\n";
        $s .= "11.00 182.00 m 272.46 182.00 l S\n";

        // Header Tabel
        $s .= self::text(16.00, 186.00, 'F2', 7.5, 'Nama Produk');
        $s .= self::text(164.00, 186.00, 'F2', 7.5, 'Variasi / SKU');
        $s .= self::text(236.00, 186.00, 'F2', 7.5, 'Qty');

        $rowY = 170.0;
        $itemsToPrint = empty($items) ? [
            ['item_name' => 'RECORD SNEAKERS OFFICIAL', 'model_name' => 'Standard', 'model_quantity_purchased' => 1]
        ] : array_slice($items, 0, 6);

        foreach ($itemsToPrint as $it) {
            if ($rowY < 45.0) {
                break;
            }
            $pName = $it['item_name'] ?? $it['product_name'] ?? 'Sepatu';
            $pVar = $it['model_name'] ?? $it['variation'] ?? $it['sku_name'] ?? '-';
            $pQty = (string) ($it['model_quantity_purchased'] ?? $it['quantity'] ?? 1);

            $s .= self::text(16.00, $rowY, 'F1', 7.0, substr($pName, 0, 28));
            $s .= self::text(164.00, $rowY, 'F1', 7.0, substr($pVar, 0, 14));
            $s .= self::text(242.00, $rowY, 'F2', 7.5, $pQty);

            $rowY -= 14.0;
            $s .= sprintf("11.00 %.2f m 272.46 %.2f l S\n", $rowY + 4.0, $rowY + 4.0);
        }

        $tableBottomY = max(35.0, $rowY + 4.0);
        $s .= sprintf("160.00 %.2f m 160.00 195.00 l S\n", $tableBottomY);
        $s .= sprintf("232.00 %.2f m 232.00 195.00 l S\n", $tableBottomY);

        // 6. Footer (y: 11 to 28)
        $s .= "11.00 28.00 m 272.46 28.00 l S\n";
        $s .= self::text(28.00, 17.00, 'F1', 6.5, 'Dicetak via ERP Koding Cutoff • Thermal Standard 100x150 mm (A6)');

        return $s;
    }

    public static function build(array $orders): string
    {
        if (empty($orders)) {
            $orders = [(object)[
                'shipping_carrier' => 'J&T Express',
                'tracking_number'  => 'JT000000000',
                'order_sn'         => 'DEMO-ORDER',
                'is_cod'           => false,
                'recipient_data'   => ['name' => 'Pelanggan', 'phone' => '-', 'full_address' => '-'],
                'items_json'       => [],
            ]];
        }

        $pageCount = count($orders);
        $offsets = [];

        $fontF1ObjNum = 3 + ($pageCount * 2);
        $fontF2ObjNum = $fontF1ObjNum + 1;

        $pageObjNums = [];
        for ($i = 0; $i < $pageCount; $i++) {
            $pageObjNums[] = 3 + ($i * 2);
        }

        $pdf = "%PDF-1.4\n";

        // 1: Catalog
        $offsets[1] = strlen($pdf);
        $pdf .= "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";

        // 2: Pages Root
        $kidsStr = implode(' 0 R ', $pageObjNums) . ' 0 R';
        $offsets[2] = strlen($pdf);
        $pdf .= "2 0 obj\n<< /Type /Pages /Kids [ " . $kidsStr . " ] /Count " . $pageCount . " >>\nendobj\n";

        // Pages & Content Streams
        for ($i = 0; $i < $pageCount; $i++) {
            $order = (object) $orders[$i];
            $pageObjNum = 3 + ($i * 2);
            $streamObjNum = $pageObjNum + 1;

            $contentStream = self::buildPageStream($order);
            $streamLen = strlen($contentStream);

            // Page Obj
            $offsets[$pageObjNum] = strlen($pdf);
            $pdf .= $pageObjNum . " 0 obj\n";
            $pdf .= "<< /Type /Page /Parent 2 0 R\n";
            $pdf .= "   /MediaBox [ 0 0 283.46 425.20 ]\n";
            $pdf .= "   /Resources << /Font << /F1 " . $fontF1ObjNum . " 0 R /F2 " . $fontF2ObjNum . " 0 R >> >>\n";
            $pdf .= "   /Contents " . $streamObjNum . " 0 R\n";
            $pdf .= ">>\nendobj\n";

            // Stream Obj
            $offsets[$streamObjNum] = strlen($pdf);
            $pdf .= $streamObjNum . " 0 obj\n";
            $pdf .= "<< /Length " . $streamLen . " >>\n";
            $pdf .= "stream\n" . $contentStream . "\nendstream\nendobj\n";
        }

        // Font F1: Helvetica
        $offsets[$fontF1ObjNum] = strlen($pdf);
        $pdf .= $fontF1ObjNum . " 0 obj\n";
        $pdf .= "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n";

        // Font F2: Helvetica-Bold
        $offsets[$fontF2ObjNum] = strlen($pdf);
        $pdf .= $fontF2ObjNum . " 0 obj\n";
        $pdf .= "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n";

        // Xref Table
        $totalObjs = $fontF2ObjNum;
        $xrefStart = strlen($pdf);
        $pdf .= "xref\n";
        $pdf .= "0 " . ($totalObjs + 1) . "\n";
        $pdf .= "0000000000 65535 f \n";
        for ($obj = 1; $obj <= $totalObjs; $obj++) {
            $pdf .= sprintf("%010d 00000 n \n", $offsets[$obj]);
        }

        $pdf .= "trailer\n";
        $pdf .= "<< /Size " . ($totalObjs + 1) . " /Root 1 0 R >>\n";
        $pdf .= "startxref\n" . $xrefStart . "\n%%EOF\n";

        return $pdf;
    }
}
