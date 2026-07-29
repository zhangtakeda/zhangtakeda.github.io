## 1. VEQKernel 的设计

### 1.1 VEQTopology

- VEQ 求解器的参数拓扑
- 积分网格配置
- VEQ 求解模式、自变量、约束条件
- 支持 pareto 的扩展型容量参数(only-numba、optional)

```python
@dataclass(frozen=True, slots=True, kw_only=True)
class VEQTopology:
    h_count: int
    v_count: int
    kappa_count: int
    psin_count: int
    F_count: int
    c_counts: tuple[int, ...]
    s_counts: tuple[int, ...]

    Nr: int
    Nt: int
    quadrature: QuadratureScheme = "legendre"
    calculus: CalculusScheme = "spectral"
    sample_count: int | None = None

    route: SourceRoute
    coordinate: SourceCoordinate
    nodes: SourceNodes
    constraint: SourceConstraint = "none"

    L_max: int | None = None
    M_max: int | None = None
    K_max: int | None = None
```

### 1.2 VEQInstance

- LCFS 的形状, 包括 B0
- 表征压强的物理剖面
- 表征电流/磁场的物理剖面
- 总电流/比压约束
- 初始猜测解

```python
@dataclass(frozen=True, slots=True, kw_only=True, eq=False)
class KernelInstance:
    a: float
    R0: float
    Z0: float
    B0: float

    ka: float = 1.0
    c_offsets: Float64Array
    s_offsets: Float64Array

    p: Float64Array
    pprime: Float64Array
    p0: float = 0.0

    ffprime: Float64Array
    psi_r: Float64Array
    itor: Float64Array
    jtor: Float64Array
    jpara: Float64Array
    q: Float64Array

    Ip: float | None = None
    beta: float | None = None

    x0: Float64Array
```
