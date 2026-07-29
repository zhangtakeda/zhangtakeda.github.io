# FusionPRIME

## 核心架构设计

架构名字借用亚里士多德的一对概念, 对应结构定义与实际计算之间的分工:

- **Harmonia (和谐):** 静态的结构与关系, 包括契约, 元模型, registry, graph 和 workflow. 它定义系统中合法的组件及其组合方式, 本身不实现具体的重型物理计算.

- **Energeia (现实活动):** 从潜能到实现的动态过程, 即系统实际运行和产生结果的过程. 它包含 model 和 kernel 的具体实现, 负责执行数值计算.

Harmonia 定义骨架与契约, Energeia 在骨架内完成具体实现. 系统因此兼具可验证的结构完整性, 以及可插拔, 可执行的计算能力.

Theoria 延续这一命名体系, 表示对计算对象和结果的观察, 展示与理解. 它不是核心计算架构的一部分, 而是建立在 Harmonia 和 Energeia 之上的可选表现层.

> A metamodel-driven, contract-validated and plugin-extensible component architecture with reactive incremental computation.

依赖方向为:

```text
Harmonia <- Energeia <- Theoria
```

Harmonia 不依赖任何具体数值实现或可视化实现; Energeia 不依赖 Theoria.

## Harmonia

**Harmonia** 是领域元模型, 组件组合与工作流框架, 包含:

- `base`: 基础抽象, reactive 与公共运行机制;
- `contract/registry`: 领域契约, 声明式注册装饰器, 一致性检查及全局实现注册表;
- `adapter`: 作为计算图的边, 调用 model 的标准语义接口, 完成坐标, 网格, 数据表示和物理量之间的确定性转换;
- `module`: 作为计算图的节点, 绑定同一实现族的 model 与 kernel, 管理 kernel 调用和当前 result;
- `graph/workflow`: 构建由 module 和 adapter 组成的计算图, 执行契约验证, 迭代环识别, 图化简, 调度和并行优化.

Harmonia 内部维护全局 registry. registry 是注册键与实现类型之间的双向映射, 只负责保存, 检查和查询通过 Harmonia 装饰器注册的 model, kernel 与 adapter.

## Energeia

**Energeia** 是官方物理模型与数值实现包, 包含具体 kernel 及对应 model.

实现通过 Harmonia 提供的装饰器注册:

```python
@equilibrium_model("veq")
class VEQEquilibrium:
    ...


@equilibrium_kernel("veq")
class VEQKernel:
    ...
```

不同实现族可以具有完全不同的数据表示. 例如:

```python
@equilibrium_model("fem")
class FEMEquilibrium:
    ...


@equilibrium_kernel("fem")
class FEMKernel:
    ...
```

kernel 不要求返回统一的具体类型. Harmonia 只检查同一实现族的 kernel 是否能够根据输入和求解结果构造或更新对应 model, 以及 model 是否提供 module 和 adapter 所要求的 API 与 property.

module 负责 model 和 kernel 之间的结构接口调用:

```text
1. module 接收 input models.
2. module 整理 kernel 输入.
3. kernel 执行计算.
4. module 构造或更新 output model.
```

adapter 不感知 model 的具体实现, 只调用约定的语义接口. 例如:

```text
1. adapter 读取 equilibrium(grid1).
2. adapter 执行规范转换.
3. adapter 生成 transport geometry(grid2).
```

具体的重采样, 插值或物理量计算方式由 model 自身决定. 对于一个确定的源端口和目标端口, 只注册一个规范 adapter, 从而保证转换链路明确且可检查.

## Theoria

**Theoria** 是 FusionPRIME 的可视化, 交互与探索层.

它可以读取:

- Harmonia 中的 graph, workflow, module, adapter 和契约信息;
- Energeia 中的 model, result 及其公开语义接口;
- workflow 保存的运行结果, 迭代记录和状态变化.

Theoria 可以提供:

- model 和 result 的静态科学绘图;
- 平衡, 输运, 源项等领域对象的标准视图;
- graph 和 workflow 的结构可视化;
- Jupyter widget 与交互式参数探索;
- dashboard, 运行状态和收敛过程展示;
- 图表, 动画和报告输出.

Theoria 不参与数值求解, 也不定义领域契约, 实现注册或工作流调度. 可视化所需的物理量应通过 model 的公开语义接口或 Harmonia adapter 获取, 而不应在 Theoria 中重复实现物理计算.

其基本数据流为:

```text
Input:
    model
    result
    graph
    workflow

Processing:
    Theoria

Output:
    figure
    widget
    dashboard
    report
```

## 注册与工作流构造

Energeia 或第三方实现需要导入 Harmonia, 以使用其基础抽象, reactive, 契约和注册装饰器; Harmonia 不反向导入任何具体实现.

典型使用方式为:

```python
from fusionprime import harmonia
from fusionprime import energeia  # 将官方实现注册到 Harmonia

equilibrium = harmonia.module(
    "equilibrium",
    implementation="veq",
    backend="cxx",
)

graph = harmonia.graph(...)
workflow = harmonia.workflow(graph)
```

导入 Energeia 时, 其装饰器会将实现直接写入 Harmonia 的全局 registry. module 初始化时根据领域类型和实现名称查询对应的 model 与 kernel:

```text
Domain type: equilibrium
Implementation: veq
model: VEQEquilibrium
kernel: VEQKernel
```

注册阶段检查实现的基本结构和同名实现族的一致性; module 初始化阶段检查局部 model, kernel 和 adapter 接口; workflow 编译阶段检查完整计算图中的端口, 数据依赖, adapter 链路和迭代关系.

graph 本身由 module 节点和 adapter 边构成:

```text
Source module
adapter
Target module
```

graph 优化直接作用于这一结构, 包括冗余转换化简, 执行顺序分析和可并行节点识别.

原始计算图可以包含显式迭代环. workflow 编译器识别其中合法的迭代结构, 并生成实际的调度和执行计划, 而不是简单禁止所有闭环.

module 保存自身最近一次 result. 再次运行时, 可自动将其作为 kernel 的初值:

```python
new_result = kernel.solve(
    inputs,
    x0=module.result,
)

module.result = new_result
```

旧 result 仍由 workflow 保存, module 只将当前 result 的引用替换为最新结果.

Theoria 是可选依赖, 不参与注册和工作流编译. 只有在需要绘图或交互展示时才需要导入:

```python
from fusionprime import theoria
```

## Energeia.kernel

kernel 是 Energeia 的主要数值实现, 只负责根据数组和标量完成计算. 高层 model 的读取, 结果构造和当前状态管理均由 module 负责.

kernel 内部统一分为三层:

- **`setup`:** 处理固定拓扑, 数组规模, 索引, 静态结构, backend 构建及 workspace 分配等通常不变的准备工作;
- **`runtime`:** 绑定本次物理输入和初值, 控制迭代过程, 调用 `evaluate`, 检查结果并返回新 result;
- **`evaluate`:** 核心数值热路径, 只操作已经准备好的数组和 workspace, 避免临时分配与重复计算.

kernel 提供 Python/C++ 双后端:

- **Numba:** 编译快速, 面向普通 Python 用户, 也作为严格浮点语义下的参考实现;
- **C++:** 面向固定拓扑和极限性能优化, 可以使用 `fastmath` 和 relaxed floating-point 规则.

两种后端共享相同的 `setup / runtime / evaluate` 语义和结果接口.

kernel 采用纯对象流, 不负责科学数据文件的读写, 也不保存 history. 仅 backend 必要的编译, 构建和加载过程可以访问文件系统.
