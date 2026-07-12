# Codex Coexistence / 与内置 Codex 共存

Codex is available inside ChatGPT, the Codex app, editors, terminals, and cloud workflows. AegisLoop does not replace those native routes.

AegisLoop is for a narrower workflow: a dedicated ChatGPT runner conversation controls an existing local Codex session through an explicit local bridge.

## Choose One Route Per Turn

| Use built-in Codex when... | Use AegisLoop when... |
| --- | --- |
| You want ChatGPT's native Codex task or cloud workflow. | You need to resume a specific local Codex session. |
| The native worktree, editor, or terminal flow already fits. | You need explicit Chat Mode, arming, ACK/NACK, and local audit state. |
| You do not need an external Run Capsule. | You need project/branch/run isolation across long browser-planned work. |

Both routes can exist in the same account. Do not ask one assistant turn to use both routes.

## AegisLoop Runner Prompt

Paste this into a dedicated runner conversation before arming:

```text
This conversation uses the AegisLoop local bridge route.
Do not start or invoke ChatGPT's built-in Codex for this turn.
Write the next local instruction as one visible fenced codex JSON block using the current arm_id and turn_nonce.
If the local loop should stop, reply with exactly <<<LOOP_STOP>>>.
```

The extension panel should show:

```text
Execution route: AegisLoop local bridge
```

If the model starts built-in Codex or discusses tool availability, keep the same conversation and repeat the runner prompt. Model switching does not change the local route while the ChatGPT conversation URL remains the same.

## GPT-5.6

GPT-5.6 Sol, Terra, and Luna are compatibility smoke targets. AegisLoop does not depend on a private model tool call; it depends on visible page text that follows the fenced JSON contract.

Do not claim a GPT-5.6 mode is verified until a real signed-in browser smoke report confirms:

1. the same ChatGPT conversation remains open;
2. the same local Codex binding remains visible;
3. a fresh turn-token block is dispatched;
4. the result is returned and ACKed once.

## 中文说明

Codex 已经可以直接在 ChatGPT、Codex 应用、编辑器、终端和云端工作流中使用。AegisLoop 不替代这些原生入口。

AegisLoop 面向的是更具体的场景：让一个专用 ChatGPT 执行线程，通过显式授权的本地 bridge，继续控制一个已经存在的本地 Codex session，并提供 Run Capsule、leader lease、结果 ACK/NACK 和审计状态。

每一轮只选择一条执行路线：

- 想使用 ChatGPT 原生 Codex 任务、云端或 worktree 时，直接使用内置 Codex。
- 想继续指定的本地 Codex session，并需要显式 Arm、隔离、恢复和审计时，使用 AegisLoop。
- 切换 GPT 模型不会改变 AegisLoop 绑定；只有 ChatGPT conversation URL、配置或显式重连发生变化时才改变路线。

GPT-5.6 Sol、Terra、Luna 目前是兼容性测试目标。没有真实登录态 smoke report 前，不宣称已经全部验证通过。
