# yomilog

[![CI](https://github.com/miruky/yomilog/actions/workflows/ci.yml/badge.svg)](https://github.com/miruky/yomilog/actions/workflows/ci.yml)
[![Deploy](https://github.com/miruky/yomilog/actions/workflows/deploy.yml/badge.svg)](https://github.com/miruky/yomilog/actions/workflows/deploy.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Test](https://img.shields.io/badge/Test-Vitest-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**「今日、何を何ページ読んだか」を付けるだけで、月間ページ数とジャンル分布がチャートになる読書統計ダッシュボードです。**

## 概要

読書メーターのような大げさな仕組みではなく、ノートの隅に付ける「6/13 こころ 40p」をそのままブラウザに置き換えたものです。日付・書名・ページ数・ジャンルを記録すると、直近12か月の月間ページ数の棒グラフ、ページ数ベースのジャンル分布ドーナツ、今月・今年・読了冊数・連続記録日数のサマリが更新されます。チャートはすべて依存ライブラリなしのSVG生成で、配色はCSSカスタムプロパティ経由なのでライト・ダークの双方に追従します。

データはlocalStorageに保存され、サーバーもアカウントも不要です。バックアップと引っ越しはJSONのエクスポート・インポートで行います。

試す: https://miruky.github.io/yomilog/

### なぜ作ったのか

読書量は「読了した冊数」で数えられがちですが、厚い本を1か月かけて読んでいる間は0冊のままで、続いている実感が持てません。ページ数を日割りで記録すれば、読了に至らない日々の積み重ねがそのままグラフに出ます。既存の読書管理サービスはSNSや書誌データベースが本体で、この用途には重すぎました。記録1件あたりの入力が5秒で済むこと、統計が開いた瞬間に見えることだけを狙っています。

## 使い方

- 上のフォームに日付(既定で今日)・書名・ページ数・ジャンルを入れて「記録する」を押します。書名とジャンルは過去の記録から補完候補が出ます
- その本を読み終えた記録には「読み終えた」を付けます。読了冊数はこの印で数えます
- 一覧の「編集」で記録をフォームに呼び出して直せます。「削除」は2回押しで確定です
- 記録が空のときは「デモデータを入れる」で過去1年ぶんの合成データが入り、画面の雰囲気を確かめられます(固定シードなので毎回同じ内容です)
- 連続日数は「今日まだ記録していない」だけでは途切れません。昨日まで続いていれば継続中として数えます

## アーキテクチャ

![yomilogのアーキテクチャ](docs/architecture.svg)

`log.ts` が記録の検証と保存、`stats.ts` が集計、`chart.ts` がSVG文字列の生成を担い、互いに独立しています。UIの `app.ts` はこの3つを束ねるだけで、自前の状態は「フォームが新規か編集か」と「一覧の表示件数」しか持ちません。日数計算はYYYY-MM-DD文字列とUTCで行い、タイムゾーンによる日付ずれを避けています。チャートは値からSVG文字列を返す純粋関数なので、目盛りの丸め(1・2・2.5・5系列)や円弧パスの組み立てまで単体テストで検証しています。

## 技術スタック

| カテゴリ | 技術                 |
| :------- | :------------------- |
| 言語     | TypeScript 5(strict) |
| チャート | 自前のSVG生成        |
| ビルド   | Vite 6               |
| テスト   | Vitest(53テスト)     |
| リンタ   | ESLint + Prettier    |
| CI / CD  | GitHub Actions       |
| 配信     | GitHub Pages         |

## プロジェクト構成

- `src/lib/log.ts` — 記録の台帳。検証・並び替え・補完候補・エクスポート/インポート
- `src/lib/stats.ts` — 月間ページ数・ジャンル分布・連続日数などの集計
- `src/lib/chart.ts` — 棒グラフとドーナツグラフのSVG文字列生成
- `src/lib/demo.ts` — 固定シードで合成するデモデータ
- `src/app.ts` — フォーム・サマリカード・チャート・一覧のUI
- `docs/architecture.svg` — アーキテクチャ図

## はじめ方

### 前提条件

- Node.js 20 以上

### セットアップ

```bash
git clone https://github.com/miruky/yomilog.git
cd yomilog
npm ci
npm run dev
```

### テストとlint

```bash
npm test
npm run lint
```

### ビルド

```bash
npm run build
```

GitHub Pagesへは `main` へのpushで自動デプロイされます。サブパス配信のため、ワークフローでは環境変数 `YOMILOG_BASE=/yomilog/` を渡してViteの `base` を切り替えています。

## 設計方針

- **記録は1行、統計は自動**: 入力はフォーム1段だけにし、集計のための操作を一切要求しません。グラフは記録のたびに引き直されます。
- **チャートも依存ゼロ**: グラフ描画ライブラリを入れず、SVGを文字列で組み立てます。色はCSS変数参照なのでテーマ切替に追従し、生成関数は純粋なのでテストが書けます。
- **時間の扱いを一本化**: 日付はYYYY-MM-DD文字列、比較はUTCのエポックに限定し、Dateのローカルタイムゾーンに依存する計算を排除しています。
- **動きは控えめに、必ず切れるように**: カードの数値カウントアップや棒の伸びは短く一度だけ。`prefers-reduced-motion: reduce` ではすべて止まります。

## ライセンス

[MIT](LICENSE)
